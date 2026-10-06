"use client";
// Split screen: the shopper's request on the left, the agent's steps arriving live; the shop owner's view on the
// right, where the unmet demand from that request shows up, and the restock agent puts a new title on the shelf.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/app/components/Header";
import { TasteMap, type Pin } from "@/app/components/TasteMap";
import { EXAMPLES } from "@/data/examples";
import { addTitle, addedTitles, coverage, myDemand, recordDemand, seedDemand, type Added, type DemandRow, type WantedTitle } from "@/lib/cycle";

type Step = { label: string; detail?: string; status: string };
type Result = { picks: Array<{ item: { id: string; title: string; category: string; price_usd: number }; why: string }>; gap?: { wanted: WantedTitle[] } | null; question?: string; extraction?: { signals: Array<{ name: string }> } };
const KIND: Record<string, string> = { "urn:entity:artist": "Vinyl", "urn:entity:movie": "Film", "urn:entity:book": "Book", "urn:entity:videogame": "Game", "urn:entity:tv_show": "TV" };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`; // one decimal: a single stocked title moves it visibly

export default function Live() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [replay, setReplay] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<DemandRow[]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [placing, setPlacing] = useState(false);
  const [landed, setLanded] = useState<string | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const feed = useRef<HTMLOListElement>(null);
  useEffect(() => { setMine(myDemand()); setAdded(addedTitles()); }, []);
  useEffect(() => { feed.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [steps]);

  const rows = [...seedDemand, ...mine];
  const addedIds = new Set(added.map((a) => a.entity_id));
  const cov = coverage(rows, addedIds);
  const missing = result?.gap?.wanted.filter((w) => !w.owned && !addedIds.has(w.entity_id)) ?? [];
  const pins: Pin[] = added.map((a) => ({ id: a.entity_id, x: a.placement.x, y: a.placement.y, image: a.image ?? "", label: a.name }));

  async function run(message: string) {
    setText(message); setSteps([]); setResult(null); setError(null); setLanded(null); setRunning(true); setReplay(null);
    try {
      const res = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Request failed"); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "mode") setReplay(ev.replay);
          if (ev.type === "step") setSteps((s) => [...s, ev.step]);
          if (ev.type === "error") setError(ev.error);
          if (ev.type === "result") {
            const r = ev.result as Result;
            setResult(r);
            if (r.gap) { recordDemand({ message, signals: (r.extraction?.signals ?? []).map((x) => x.name), wanted: r.gap.wanted }); setMine(myDemand()); }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function restock(w: WantedTitle) {
    setPlacing(true); setError(null);
    try {
      const res = await fetch("/api/place", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: w.entity_id, type: w.type }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Placing failed");
      const before = coverage(rows, addedIds);
      addTitle({ entity_id: w.entity_id, name: w.name, type: w.type, image: w.image, placement: data.placement });
      const now = addedTitles();
      setAdded(now);
      setDelta(coverage(rows, new Set(now.map((a) => a.entity_id))) - before);
      setLanded(`${w.name} joins ${data.placement.clusterName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <main className="shop">
      <Header side="shopper" />
      <section className="hero compact">
        <h1>Watch both sides at once.</h1>
        <p className="lede">Left: a shopper asks, and the agent works through Qloo step by step. Right: what the shop owner sees a moment later.</p>
      </section>
      <div className="split">
        <section className="side shopper-side">
          <p className="side-label">Shopper</p>
          <div className="tabs">{EXAMPLES.map((ex) => <button key={ex.label} className="tab" disabled={running} onClick={() => run(ex.text)}>{ex.label}</button>)}</div>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(text); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="What are they into?" />
            <button className="go" disabled={running || !text.trim()}>{running ? "Working…" : "Ask"}</button>
          </form>
          <ol className="feed" ref={feed} aria-live="polite">
            {steps.map((s, i) => <li key={i} className={s.status}><b>{s.label}</b>{s.detail && <span>{s.detail}</span>}</li>)}
            {running && <li className="pending">thinking…</li>}
          </ol>
          {replay && <p className="fine">Example: a recorded run of the live agent, replayed at reading speed. Type your own request to watch it live.</p>}
          {result?.question && <p className="ask-back"><b>The assistant asks:</b> {result.question}</p>}
          {result && result.picks.length > 0 && (
            <div className="mini-shelf">
              {result.picks.map((p) => (
                <Link key={p.item.id} href={`/item/${p.item.id}`} title={p.why}><img src={`/covers/${p.item.id}.jpg`} alt={p.item.title} /><span>{p.item.title}</span></Link>
              ))}
            </div>
          )}
        </section>
        <section className="side owner-side">
          <p className="side-label">Shop owner</p>
          <div className="mini-gauge"><span>Taste coverage</span><b>{pct(cov)}</b><small>{rows.length} requests</small>{delta !== null && delta > 0 && <em key={added.length} className="delta">+{(delta * 100).toFixed(1)} pts</em>}</div>
          {result?.gap && (
            <div className="new-demand">
              <p><b>New unmet demand</b> from this request: we carry {result.gap.wanted.filter((w) => w.owned).length} of the {result.gap.wanted.length} titles this taste loves most.</p>
              <div className="ghosts">
                {missing.slice(0, 6).map((w, i) => (
                  <button key={w.entity_id} type="button" className="ghost-cover" style={{ animationDelay: `${i * 120}ms` }} disabled={placing} onClick={() => restock(w)} title={`Stock ${w.name}`}>
                    {w.image ? <img src={w.image} alt="" /> : <span>{KIND[w.type]}</span>}
                    <small>{w.name}</small>
                  </button>
                ))}
              </div>
              {missing.length > 0 && <p className="fine">Click a title to stock it: Qloo places it on the taste map and coverage updates.</p>}
            </div>
          )}
          {landed && <p className="landed"><b>{landed}</b></p>}
          <div className="mini-map"><TasteMap pins={pins} /></div>
          <Link href="/owner" className="fine">Open the full owner view</Link>
        </section>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
