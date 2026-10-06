"use client";
// Owner side: the loop. Coverage of what shoppers' tastes want, the agent's stock suggestions ranked by how much
// coverage they add, one-click "add to shelf" (cold start on the taste map), and what Qloo did at each step.
import { useEffect, useMemo, useState } from "react";
import catalog from "@/data/catalog.json";
import owner from "@/data/owner.json";
import { CrateList, TasteMap, type Pin } from "@/app/components/TasteMap";
import { addTitle, addedTitles, coverage, myDemand, resetLoop, seedDemand, suggestions, type Added, type DemandRow } from "@/lib/cycle";

type Section = (typeof owner.sections)[number];
const TITLE = new Map((catalog.items as Array<{ id: string; title: string }>).map((i) => [i.id, i.title]));
const KIND: Record<string, string> = { "urn:entity:artist": "Vinyl", "urn:entity:movie": "Film", "urn:entity:book": "Book", "urn:entity:videogame": "Game", "urn:entity:tv_show": "TV" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function OwnerView() {
  const [mine, setMine] = useState<DemandRow[]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setMine(myDemand()); setAdded(addedTitles()); }, []);

  const rows = useMemo(() => [...seedDemand, ...mine], [mine]);
  const addedIds = useMemo(() => new Set(added.map((a) => a.entity_id)), [added]);
  const cov = coverage(rows, addedIds);
  const base = coverage(rows, new Set());
  // Up to three titles from this viewer's own requests first (so a judge sees their demand), then the biggest gains.
  const allSugg = suggestions(rows, addedIds);
  const yours = allSugg.filter((s) => s.yours).slice(0, 3);
  const sugg = [...yours, ...allSugg.filter((s) => !s.yours).sort((a, b) => b.gain - a.gain)].slice(0, 8);
  const last = added[added.length - 1];
  const section: Section | undefined = owner.sections.find((s) => s.id === active);
  const pins: Pin[] = added.map((a) => ({ id: a.entity_id, x: a.placement.x, y: a.placement.y, image: a.image ?? "", label: a.name }));

  async function stock(s: (typeof sugg)[number]) {
    setBusy(s.entity_id); setError(null);
    try {
      const res = await fetch("/api/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: s.entity_id, type: s.type }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Placing failed");
      const a: Added = { entity_id: s.entity_id, name: s.name, type: s.type, image: s.image, placement: data.placement };
      addTitle(a); setAdded(addedTitles()); setActive(a.placement.cluster);
      setLog(data.precomputed
        ? `Placed from 36 Qloo insights calls made earlier for the demo (cached).`
        : `Placed live: ${data.calls} Qloo insights calls, one per reference taste, then matched to the nearest section.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="loop">
        <div className="gauge">
          <p className="eyebrow">Taste coverage</p>
          <p className="big">{pct(cov)}</p>
          <p className="gauge-note">
            of the titles your shoppers&apos; tastes love most are on your shelves, across {rows.length} requests
            ({seedDemand.length} demo shoppers{mine.length ? `, ${mine.length} from you` : ""}).
            {added.length > 0 && <> Up from <b>{pct(base)}</b> after stocking {added.length} title{added.length > 1 ? "s" : ""}.</>}
          </p>
          {(mine.length > 0 || added.length > 0) && <button type="button" className="ghost" onClick={() => { resetLoop(); setMine([]); setAdded([]); setLog(null); }}>Reset demo</button>}
        </div>
        <div className="suggest">
          <p className="eyebrow">The agent suggests stocking</p>
          <ol>
            {sugg.map((s) => (
              <li key={s.entity_id}>
                {s.image ? <img src={s.image} alt="" loading="lazy" /> : <span className="noimg" />}
                <div className="sg-text">
                  <strong>{s.name}</strong>
                  <span>{KIND[s.type]} · wanted by {s.askedBy} shopper{s.askedBy > 1 ? "s" : ""}{s.yours ? " (incl. you)" : ""} · +{(s.gain * 100).toFixed(1)} pts</span>
                </div>
                <button type="button" disabled={busy !== null} onClick={() => stock(s)}>{busy === s.entity_id ? "Placing…" : "Add to shelf"}</button>
              </li>
            ))}
          </ol>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      {last && (
        <p className="landed">
          <b>{last.name}</b> lands in <b>{last.placement.clusterName}</b>, next to {last.placement.neighbours.map((x) => TITLE.get(x.id)).join(", ")}.
          {log && <span className="hood"> Under the hood: {log}</span>}
        </p>
      )}

      <div className="owner-grid">
        <section className="store">
          <TasteMap active={active} onSection={(id) => setActive(id)} pins={pins} />
          <CrateList onSection={setActive} />
        </section>
        <aside className="owner-panel">
          {!section && <p className="muted">Pick a section on the map to see who shops it and what its audience loves that you don&apos;t carry.</p>}
          {section && (
            <>
              <p className="eyebrow">Section</p>
              <h2>{section.name}</h2>
              <p className="muted">{section.line}</p>
              <p className="mix">{Object.entries(section.categories).map(([k, v]) => `${v} ${k}`).join(" · ")}</p>
              <h3>Who shops here</h3>
              <ul className="who">
                {section.who.slice(0, 4).map((w) => <li key={w.taste}><span>Fans of {w.taste}</span><b>{w.weight.toFixed(2)}</b></li>)}
              </ul>
              <h3>Its audience also loves</h3>
              <div className="stock">
                {section.stock.slice(0, 5).map((s) => (
                  <div key={s.entity_id} className="stock-item">
                    <img src={s.image} alt="" loading="lazy" />
                    <div><strong>{s.name}</strong><span>{KIND[s.type] ?? ""}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
