// Qloo taste analysis: insights with filter.type=urn:tag reads a set of tastes as Qloo tags (genres, styles, moods),
// ranked by affinity. One call per request; the agent and the live screen show it as "how Qloo reads this taste".
import { insights, type QlooCall } from "@/lib/qloo/client";

export async function tasteTags(signalIds: string[], calls: QlooCall[], take = 8): Promise<string[]> {
  if (!signalIds.length) return [];
  try {
    const res = await insights({ "filter.type": "urn:tag", "signal.interests.entities": signalIds.join(","), take: "50" }, calls);
    const seen = new Set<string>();
    const out: string[] = [];
    // Keep culture tags (genre, style, mood); drop place and payment tags ("American Express", "Inexpensive").
    const MEDIA = /^urn:entity:(artist|movie|book|tv_show|videogame|podcast)$/;
    for (const t of (res.results.tags ?? []) as Array<{ name?: string; subtype?: string; type?: string; types?: string[] }>) {
      const kind = String(t.subtype ?? t.type ?? "");
      if (!/^urn:tag:(genre:music|genre:media|genre:qloo|subgenre|style|music|influence|keyword:media|category|theme|plot)/.test(kind)) continue;
      if (t.types && !t.types.some((x) => MEDIA.test(x))) continue;
      const name = String(t.name ?? "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name.charAt(0).toUpperCase() + name.slice(1));
      if (out.length >= take) break;
    }
    return out;
  } catch {
    return []; // not every signal set supports tag analysis; the agent simply works without it
  }
}
