// Qloo side of the agent: map catalog items to Qloo entities and score them against a set of signal entities.
import catalog from "@/data/catalog.json";
import { insights, search, type QlooCall } from "@/lib/qloo/client";
import { norm } from "./rank";
import { readAffinity, readContributions, type QlooEntityType } from "@/lib/qloo/types";

/**
 * Resolve a shopper's signal to a Qloo entity. The typed search can return a wrong top hit
 * ("Studio Ghibli" as a brand gives "Picsart Photo Studio"), so prefer an exact name match,
 * then an exact match across all types, then the typed top hit.
 */
export async function resolveSignal(
  name: string,
  type: string | undefined,
  calls: QlooCall[],
): Promise<{ name: string; entity_id: string; exact: boolean } | null> {
  const key = norm(name);
  const typed = (await search(name, type, calls)).results ?? [];
  const exactTyped = typed.find((e) => norm(e.name) === key);
  if (exactTyped) return { name: exactTyped.name, entity_id: exactTyped.entity_id, exact: true };
  const any = (await search(name, undefined, calls)).results ?? [];
  const exactAny = any.find((e) => norm(e.name) === key);
  if (exactAny) return { name: exactAny.name, entity_id: exactAny.entity_id, exact: true };
  const top = typed[0] ?? any[0];
  return top ? { name: top.name, entity_id: top.entity_id, exact: false } : null;
}

export interface Item {
  id: string;
  title: string;
  category: string;
  price_usd: number;
  qloo: { type: string; name: string; entity_id?: string };
  creators: string[]; // who made it (author, artist, director, cast, studio, brand)
  works: string[]; // the work or franchise it belongs to
  tags?: string[]; // Qloo tags (catalog v2)
  mock_tags?: string[]; // hand-written tags (catalog v1 only)
  image?: string | null;
  image_source?: string;
  blurb?: string;
  year?: string;
  popularity?: number | null;
  age_min?: number; // youngest recipient it suits, from its official rating (scripts/age_ratings.mts)
}

export const CATALOG: Item[] = catalog.items as Item[];

export interface ItemScore {
  affinity: number;
  chain: Array<{ entity_id: string; score: number }>;
}

/** catalog item id -> Qloo entity id. Uses the id stored in the catalog; falls back to the top /search hit. */
export async function mapCatalog(calls: QlooCall[], items: Item[] = CATALOG): Promise<Map<string, string>> {
  const itemIds = new Map<string, string>();
  await Promise.all(
    items.map(async (it) => {
      if (it.qloo.entity_id) return void itemIds.set(it.id, it.qloo.entity_id);
      const hit = (await search(it.qloo.name, it.qloo.type, calls)).results?.[0];
      if (hit) itemIds.set(it.id, hit.entity_id);
    }),
  );
  return itemIds;
}

const CHUNK = 50; // entities per insights call

/** Who the gift is for, as Qloo demographic signals (shifts affinity toward what people like them love). */
export interface Demo { age?: "35_and_younger" | "36_to_55" | "55_and_older"; gender?: "male" | "female" }
export const demoParams = (d: Demo): Record<string, string> => ({
  ...(d.age ? { "signal.demographics.age": d.age } : {}),
  ...(d.gender ? { "signal.demographics.gender": d.gender } : {}),
});

/** Insights calls per entity type (chunks of 50). Returns catalog item id -> score; items Qloo leaves out are absent. */
export async function scoreCatalog(
  signalIds: string[],
  itemIds: Map<string, string>,
  calls: QlooCall[],
  items: Item[] = CATALOG,
  demo: Demo = {},
): Promise<{ scores: Map<string, ItemScore>; byType: Array<{ type: string; scored: number }> }> {
  const byType = new Map<string, Item[]>();
  for (const it of items) if (itemIds.has(it.id)) byType.set(it.qloo.type, [...(byType.get(it.qloo.type) ?? []), it]);

  const scores = new Map<string, ItemScore>();
  const summary: Array<{ type: string; scored: number }> = [];
  await Promise.all(
    [...byType.entries()].map(async ([type, typeItems]) => {
      const entityIds = [...new Set(typeItems.map((it) => itemIds.get(it.id)!))];
      let scored = 0;
      for (let i = 0; i < entityIds.length; i += CHUNK) {
        const chunk = entityIds.slice(i, i + CHUNK);
        const res = await insights(
          {
            "filter.type": type as QlooEntityType,
            "signal.interests.entities": signalIds.join(","),
            "filter.results.entities": chunk.join(","),
            "feature.explainability": "true",
            ...demoParams(demo),
            take: String(chunk.length),
          },
          calls,
        );
        const ents = res.results.entities ?? [];
        scored += ents.length;
        for (const e of ents) {
          const affinity = readAffinity(e);
          if (affinity === null) continue;
          for (const it of typeItems) if (itemIds.get(it.id) === e.entity_id) scores.set(it.id, { affinity, chain: readContributions(e) });
        }
      }
      summary.push({ type, scored });
    }),
  );
  return { scores, byType: summary };
}
