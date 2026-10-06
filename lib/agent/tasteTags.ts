// Qloo taste analysis: insights with filter.type=urn:tag reads a set of tastes as Qloo tags (genres, styles, moods),
// ranked by affinity. One call per request; the agent and the live screen show it as "how Qloo reads this taste".
import { insights, type QlooCall } from "@/lib/qloo/client";

// Tag kinds worth showing a shopper, in the order we prefer them: genres and styles first, plain plot keywords last.
const KINDS = ["genre:music", "genre:qloo", "genre:media", "subgenre", "style", "audience", "artist:qloo", "music", "influence", "emotional_tone", "theme", "character", "plot", "category", "keyword:media"];
// A person signal is read through their work: a director through films, a writer like Murakami through books.
const READ_AS: Record<string, string[]> = { "urn:entity:person": ["urn:entity:movie", "urn:entity:book", "urn:entity:tv_show"], "urn:entity:director": ["urn:entity:movie"], "urn:entity:author": ["urn:entity:book"] };

// formats: the entity types the shopper named. Tags that describe other formats are dropped, so jazz and arthouse
// films are not read as "Survival, Crafting" because Qloo also ranks video-game categories for the same fans.
export async function tasteTags(signalIds: string[], calls: QlooCall[], take = 8, formats: string[] = []): Promise<string[]> {
  if (!signalIds.length) return [];
  try {
    const res = await insights({ "filter.type": "urn:tag", "signal.interests.entities": signalIds.join(","), take: "50" }, calls);
    const want = new Set(formats.flatMap((f) => READ_AS[f] ?? [f]).filter(Boolean));
    const MEDIA = /^urn:entity:(artist|movie|book|tv_show|videogame|podcast)$/;
    // Audience-identity tags describe people, not the work; showing them to a shopper reads as a label on the recipient.
    const IDENTITY = /\b(gay|lesbian|lgbt\w*|queer|bisexual|transgender)\b/i; // narrow on purpose: "Black metal" or "Asian cinema" are genres
    const seen = new Set<string>();
    const kept: Array<{ name: string; rank: number; i: number }> = [];
    ((res.results.tags ?? []) as Array<{ name?: string; subtype?: string; type?: string; types?: string[] }>).forEach((t, i) => {
      const kind = String(t.subtype ?? t.type ?? "").replace(/^urn:tag:/, "");
      const rank = KINDS.findIndex((k) => kind === k || kind.startsWith(`${k}:`));
      if (rank < 0) return; // place, brand and payment tags ("American Express", "Inexpensive")
      const types = t.types ?? [];
      if (!types.some((x) => MEDIA.test(x))) return;
      if (want.size && !types.some((x) => want.has(x))) return;
      const name = String(t.name ?? "").trim();
      if (!name || IDENTITY.test(name)) return;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return;
      seen.add(key);
      kept.push({ name: name.charAt(0).toUpperCase() + name.slice(1), rank, i });
    });
    // Better kinds first; within a kind, Qloo's own order (affinity). At most 4 of one kind, so a music taste
    // next to a book taste still shows the book side ("Magical Realism", not an eighth rock genre).
    const perKind = new Map<number, number>();
    return kept.sort((a, b) => a.rank - b.rank || a.i - b.i)
      .filter((t) => { const n = perKind.get(t.rank) ?? 0; perKind.set(t.rank, n + 1); return n < 4; })
      .slice(0, take).map((t) => t.name);
  } catch {
    return []; // not every signal set supports tag analysis; the agent simply works without it
  }
}
