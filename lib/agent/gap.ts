// The agent's store check: what does this shopper's taste love most, in the formats we sell, and do we carry it?
// Qloo insights without a catalog filter -> top 10 titles; coverage = how many of those are on our shelves.
// Missing titles become demand the owner sees (the loop: unmet taste -> stock suggestion -> cold start).
import { insights, type QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { CATALOG } from "./score";

export const SELLABLE: QlooEntityType[] = ["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"];
const OWNED = new Set(CATALOG.map((i) => i.qloo.entity_id).filter(Boolean) as string[]);
// "Tom Petty and the Heartbreakers" and "Tom Petty" are one act for a record shop: compare artists by core name.
const core = (n: string) => n.toLowerCase().replace(/^the\s+/, "").replace(/\s+(and|&)\s+(the|his|her)\s+.*$/, "").replace(/[^a-z0-9]+/g, " ").trim();
const OWNED_ACTS = new Set(CATALOG.filter((i) => i.qloo.type === "urn:entity:artist").flatMap((i) => [i.qloo.name, ...i.creators]).map(core));

export interface Wanted { entity_id: string; name: string; type: string; image: string | null; affinity: number | null; owned: boolean }
export interface Gap { formats: string[]; wanted: Wanted[]; coverage: number }

export async function demandGap(signalIds: string[], formats: string[], calls: QlooCall[]): Promise<Gap | null> {
  const types = (formats.filter((t) => SELLABLE.includes(t as QlooEntityType)) as QlooEntityType[]);
  const ask = types.length ? [...new Set(types)] : (["urn:entity:artist", "urn:entity:movie"] as QlooEntityType[]);
  let top: Wanted[] = [];
  for (const t of ask) {
    try {
      const res = await insights({ "filter.type": t, "signal.interests.entities": signalIds.join(","), take: "10" }, calls);
      for (const e of res.results.entities ?? []) {
        if (signalIds.includes(e.entity_id)) continue;
        const url = (e.properties as { image?: { url?: string } } | undefined)?.image?.url ?? "";
        top.push({ entity_id: e.entity_id, name: e.name, type: t, image: url.startsWith("http") ? url : null, affinity: e.query?.affinity ?? null, owned: OWNED.has(e.entity_id) || (t === "urn:entity:artist" && OWNED_ACTS.has(core(e.name))) });
      }
    } catch {
      // some entities are not valid insight signals for a type; the check simply covers fewer formats
    }
  }
  if (!top.length) return null;
  top = top.sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, 10);
  return { formats: ask, wanted: top, coverage: top.filter((w) => w.owned).length / top.length };
}
