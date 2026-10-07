// The home page's "one request, start to finish": a real recorded run of the shop assistant, followed from the
// shopper's words to the owner's restock list. Every line comes from data (the saved run, the store check, the
// precomputed cold-start placement), so the card shows the mechanism without a single made-up number.
import Link from "next/link";
import saved from "@/data/saved_answers.json";
import cycle from "@/data/cycle.json";
import catalog from "@/data/catalog.json";

type Run = { picks: Array<{ item: { id: string; title: string } }>; gap: { wanted: Array<{ entity_id: string; name: string; owned: boolean; image?: string | null }> } };
const REQUEST = "He's into Joy Division and rereads Murakami every winter.";
const run = (saved as unknown as Record<string, Run>)[REQUEST];
const TITLE = new Map((catalog.items as Array<{ id: string; title: string }>).map((i) => [i.id, i.title]));
const PLACED = cycle.placements as Record<string, { clusterName: string; neighbours: Array<{ id: string }> }>;
// "The Cure: Disintegration (2010 Remaster), LP" -> "Disintegration"; artist() keeps the part before the colon.
const short = (t: string) => t.replace(/,\s*LP$/, "").replace(/\s*\((?:[^)]*)\)\s*$/, "").split(": ").slice(-1)[0];
const artist = (t: string) => t.replace(/,\s*LP$/, "").replace(/\s*\((?:[^)]*)\)\s*$/, "").split(": ")[0];

export function ChainCard() {
  if (!run) return null;
  const missing = run.gap.wanted.filter((w) => !w.owned);
  const carried = run.gap.wanted.length - missing.length;
  const lead = missing.find((w) => PLACED[w.entity_id]) ?? missing[0];
  const place = lead ? PLACED[lead.entity_id] : undefined;
  const near = (place?.neighbours ?? []).slice(0, 2).map((n) => artist(TITLE.get(n.id) ?? "")).filter(Boolean);
  return (
    <aside className="chain-card" aria-label="One request, start to finish">
      <p className="chain-kicker">One real request, start to finish</p>
      <ol>
        <li>
          <b>The shopper writes</b>
          <q>{REQUEST}</q>
        </li>
        <li>
          <b>The assistant picks five from the shelves</b>
          <span className="chain-covers">{run.picks.map((p) => <img key={p.item.id} src={`/covers/${p.item.id}.jpg`} alt={p.item.title} title={p.item.title} />)}</span>
          <small>{short(run.picks[0].item.title)}, {short(run.picks[1].item.title)} and three more</small>
        </li>
        <li>
          <b>Qloo&apos;s store check</b>
          <span>This taste loves {run.gap.wanted.length} titles most. The shop carries {carried}. Not on the shelves: {missing.slice(0, 3).map((m) => m.name).join(", ")}.</span>
        </li>
        {lead && (
          <li className="chain-owner">
            <b>The owner&apos;s restock list</b>
            <span className="chain-restock">
              {lead.image && <img src={lead.image} alt="" />}
              <span><strong>{lead.name}</strong>{place ? <> goes to the shelf in &ldquo;{place.clusterName}&rdquo;{near.length ? <>, next to {near.join(" and ")}</> : null}. Placed by Qloo with no sales history.</> : " goes on the restock list."}</span>
            </span>
          </li>
        )}
      </ol>
      <Link href="/live?ex=0" className="chain-link">Watch this run, step by step →</Link>
    </aside>
  );
}
