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
  const [plan, setPlan] = useState<null | { steps: Array<{ label: string }>; picks: Array<{ entity_id: string; name: string; type: string; image: string | null; askedBy: number; reason: string }>; summary: string; before: number; after: number }>(null);
  const [planning, setPlanning] = useState(false);

  async function askAgent() {
    setPlanning(true); setError(null); setPlan(null);
    try {
      const res = await fetch("/api/owner-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mine, added: added.map((a) => a.entity_id) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The agent could not run");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  }
  useEffect(() => { setMine(myDemand()); setAdded(addedTitles()); }, []);

  const rows = useMemo(() => [...seedDemand, ...mine], [mine]);
  const addedIds = useMemo(() => new Set(added.map((a) => a.entity_id)), [added]);
  const cov = coverage(rows, addedIds);
  const base = coverage(rows, new Set());
  // Up to three titles from this viewer's own requests first (so a judge sees their demand), then the biggest gains.
  const allSugg = suggestions(rows, addedIds);
  const yours = allSugg.filter((s) => s.yours).slice(0, 3);
  // Then the biggest gains, taken round-robin across formats so the owner sees films, books and games too.
  const rest = allSugg.filter((s) => !s.yours).sort((a, b) => b.gain - a.gain);
  const byFormat = new Map<string, typeof rest>();
  for (const s of rest) byFormat.set(s.type, [...(byFormat.get(s.type) ?? []), s]);
  const mixed: typeof rest = [];
  while (mixed.length < 8 && [...byFormat.values()].some((l) => l.length)) for (const l of byFormat.values()) { const x = l.shift(); if (x && mixed.length < 8) mixed.push(x); }
  const sugg = [...yours, ...mixed].slice(0, 8);
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
        ? `Qloo insights scored this title against the map's 36 reference tastes; it joins the section of its 5 nearest titles.`
        : `Qloo insights scored this title live against the map's 36 reference tastes (${data.calls} calls); it joins the section of its 5 nearest titles.`);
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
          <p className="eyebrow">Taste coverage of your shelves</p>
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
                {s.image ? <img src={s.image} alt="" loading="lazy" /> : <span className="noimg">{KIND[s.type]}</span>}
                <div className="sg-text">
                  <strong>{s.name}</strong>
                  <span>{KIND[s.type]} · wanted by {s.askedBy} shopper{s.askedBy > 1 ? "s" : ""}{s.yours ? " (incl. you)" : ""} · coverage +{(s.gain * 100).toFixed(1)} pts</span>
                </div>
                <button type="button" disabled={busy !== null} onClick={() => stock(s)}>{busy === s.entity_id ? "Placing…" : "Add to shelf"}</button>
              </li>
            ))}
          </ol>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="agent-plan">
        <div className="ap-head">
          <div>
            <p className="eyebrow">Restock agent</p>
            <p className="ap-lede">Let the agent read your unmet demand, check who loves each candidate with Qloo, and pick three titles to stock.</p>
          </div>
          <button type="button" className="go" disabled={planning} onClick={askAgent}>{planning ? "Thinking it through…" : "Ask the agent for a plan"}</button>
        </div>
        {plan && (
          <div className="ap-body">
            <ol className="ap-steps">{plan.steps.map((s, i) => <li key={i}>{s.label}</li>)}</ol>
            <div className="ap-picks">
              {plan.picks.map((p) => {
                const s = sugg.find((x) => x.entity_id === p.entity_id) ?? allSugg.find((x) => x.entity_id === p.entity_id);
                const done = addedIds.has(p.entity_id);
                return (
                  <div key={p.entity_id} className="ap-pick">
                    {p.image ? <img src={p.image} alt="" /> : <span className="noimg">{KIND[p.type]}</span>}
                    <div><strong>{p.name}</strong><span>{KIND[p.type]} · wanted by {p.askedBy}</span><p>{p.reason}</p></div>
                    <button type="button" disabled={done || busy !== null || !s} onClick={() => s && stock(s)}>{done ? "On the shelf" : busy === p.entity_id ? "Placing…" : "Add to shelf"}</button>
                  </div>
                );
              })}
            </div>
            <p className="ap-sum">Stocking all three takes coverage from <b>{pct(plan.before)}</b> to <b>{pct(plan.after)}</b>. {plan.summary}</p>
          </div>
        )}
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
              {"audience" in section && section.audience && <p className="aud">{(section.audience as { summary: string }).summary} <span>(Qloo demographics)</span></p>}
              <p className="fine">Tastes that lean into this section: {section.who.slice(0, 3).map((w) => w.taste).join(", ")}.</p>
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
