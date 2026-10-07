"use client";
import { passHeaders } from "@/app/components/pass";
// Split screen: the shopper's request on the left, the agent's steps arriving live; the shop owner's view on the
// right, where the unmet demand from that request shows up, and the restock agent puts a new title on the shelf.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/app/components/Header";
import type { Pin } from "@/app/components/TasteMap";
import { LightMap } from "@/app/components/LightMap";
import { Cover } from "@/app/components/Cover";
import { EXAMPLES } from "@/data/examples";
import { addTitle, addedTitles, coverage, fmtPct, myDemand, recordDemand, seedDemand, type Added, type DemandRow, type WantedTitle } from "@/lib/cycle";

type Step = { kind?: string; label: string; detail?: string; status: string; light?: Record<string, number>; tags?: string[] };
// One plain word per kind of step, shown on the step's badge.
const STEP_WORD: Record<string, string> = { lookup: "Find", score: "Score", rank: "Pick", read: "Read", filter: "Filter" };
type Result = { calls?: Array<{ endpoint: string; params?: Record<string, string>; cache?: string }>; picks: Array<{ item: { id: string; title: string; category: string; price_usd: number }; why: string; basis?: string }>; gap?: { wanted: WantedTitle[] } | null; question?: string; extraction?: { signals: Array<{ name: string }> } };
const KIND: Record<string, string> = { "urn:entity:artist": "Vinyl", "urn:entity:movie": "Film", "urn:entity:book": "Book", "urn:entity:videogame": "Game", "urn:entity:tv_show": "TV" };
const pct = fmtPct;

// Group the run's Qloo calls by endpoint and what they asked for, for the "what the agent asked Qloo" panel.
function traceRows(calls: Array<{ endpoint: string; params?: Record<string, string> }>) {
  const m = new Map<string, { key: string; endpoint: string; what: string; n: number }>();
  for (const c of calls) {
    const p = c.params ?? {};
    const what = [p["filter.type"] && `filter.type=${p["filter.type"].replace("urn:entity:", "").replace("urn:tag", "tag (taste analysis)")}`, p["filter.results.entities"] && "filter.results.entities (our catalog)", p["feature.explainability"] && "explainability", p["signal.location.query"] && `location=${p["signal.location.query"]}`, c.endpoint === "/search" && p.query && `query`].filter(Boolean).join(" · ");
    const key = c.endpoint + what;
    const row = m.get(key) ?? { key, endpoint: c.endpoint, what, n: 0 };
    row.n++; m.set(key, row);
  }
  return [...m.values()];
}

export default function Live() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [replay, setReplay] = useState<boolean | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paused, setPaused] = useState<{ note: string; request: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<DemandRow[]>([]);
  const [added, setAdded] = useState<Added[]>([]);
  const [placing, setPlacing] = useState(false);
  const [landed, setLanded] = useState<string | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [light, setLight] = useState<Record<string, number> | null>(null);
  const feed = useRef<HTMLOListElement>(null);
  const autoRan = useRef(false); // effects run twice in development; start the example once
  useEffect(() => {
    setMine(myDemand()); setAdded(addedTitles());
    // Arriving from a home-page example (?ex=N): start that shopper's run straight away.
    const raw = new URLSearchParams(window.location.search).get("ex");
    const ex = Number(raw);
    if (raw !== null && !autoRan.current && Number.isInteger(ex) && EXAMPLES[ex]) { autoRan.current = true; run(EXAMPLES[ex].text); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { feed.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [steps]);

  const rows = [...seedDemand, ...mine];
  const addedIds = new Set(added.map((a) => a.entity_id));
  const cov = coverage(rows, addedIds);
  const missing = result?.gap?.wanted.filter((w) => !w.owned && !addedIds.has(w.entity_id)) ?? [];
  const pins: Pin[] = added.map((a) => ({ id: a.entity_id, x: a.placement.x, y: a.placement.y, image: a.image ?? "", label: a.name }));

  async function run(message: string, live = false) {
    setText(message); setSteps([]); setResult(null); setLight(null); setError(null); setLanded(null); setRunning(true); setReplay(null); setPaused(null);
    try {
      const res = await fetch("/api/live", { method: "POST", headers: passHeaders(), body: JSON.stringify({ message, live }) });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Request failed"); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      let pausedRun = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "mode") { setReplay(ev.replay); setSavedAt(ev.savedAt ?? null); if (ev.paused) { pausedRun = true; setPaused(ev.paused); setText(ev.paused.request); } }
          if (ev.type === "step") { const { light: l, ...step } = ev.step as Step; if (l) setLight(l); setSteps((s) => [...s, step]); }
          if (ev.type === "error") { setError(ev.error); finished = true; }
          if (ev.type === "result") {
            finished = true;
            const r = ev.result as Result;
            setResult(r);
            if (r.gap && !pausedRun) { recordDemand({ message, signals: (r.extraction?.signals ?? []).map((x) => x.name), wanted: r.gap.wanted }); setMine(myDemand()); }
          }
        }
      }
      // The function hit its time limit or the connection dropped: say so instead of leaving half a run on screen.
      if (!finished) setError("The agent stopped before it finished. Try again, or pick one of the examples.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function restock(w: WantedTitle) {
    setPlacing(true); setError(null);
    try {
      const res = await fetch("/api/place", { method: "POST", headers: passHeaders(), body: JSON.stringify({ entity_id: w.entity_id, type: w.type }) });
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

  const owned = result?.gap?.wanted.filter((w) => w.owned).length ?? 0; // same number as the shopper-side store check
  const stockedNow = result?.gap?.wanted.filter((w) => !w.owned && addedIds.has(w.entity_id)).length ?? 0;
  const wantedN = result?.gap?.wanted.length ?? 0;
  return (
    <main className="shop live-b">
      <Header side="shopper" />
      <section className="lb-hero">
        <p className="lb-kicker">Live demo · two Claude agents on Qloo</p>
        <h1>Watch both sides at once.</h1>
        <p className="lb-lede">A shopper asks for a gift. The assistant works through Qloo on the left; the owner sees what the shop was missing on the right.</p>
        <div className="lb-tabs scroll-x">
          <span>Try a shopper:</span>
          {EXAMPLES.map((ex) => <button key={ex.label} className={`lb-tab${text === ex.text ? " on" : ""}`} disabled={running} onClick={() => run(ex.text)}>{ex.label}</button>)}
        </div>
      </section>

      <div className="lb-split">
        <section className="lb-shopper">
          <p className="lb-label"><span>1</span> The shopper</p>
          <form className="lb-ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(text); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} aria-label="What are they into?" placeholder="Who is it for, and what are they into?" />
            <button className="lb-go" disabled={running || !text.trim()}>{running ? "Working…" : "Ask the assistant"}</button>
          </form>
          <ol className="lb-steps" ref={feed} aria-live="polite">
            {steps.map((s, i) => (
              <li key={i} className={s.status}>
                <em>{STEP_WORD[s.kind ?? ""] ?? "Step"}</em>
                <div><b>{s.label}</b>{s.tags ? <span className="tag-chips">{s.tags.map((t) => <i key={t}>{t}</i>)}</span> : s.detail && <span>{s.detail}</span>}</div>
              </li>
            ))}
            {running && <li className="pending"><em>…</em><div><b>The agent is working through Qloo</b></div></li>}
            {!steps.length && !running && <li className="idle"><em>Start</em><div><b>Pick a shopper above, or write your own request.</b><span>Every step the agent takes shows up here as it happens.</span></div></li>}
          </ol>
          {paused && <p className="lb-note">{paused.note} Recorded request: “{paused.request}”</p>}
          {replay && !running && !paused && <p className="lb-note">Played back from a real agent run{savedAt ? ` on ${new Date(savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}: same Qloo calls, same picks. <button type="button" className="linklike" onClick={() => run(text, true)}>Run it live now</button></p>}
          {result?.question && <p className="ask-back"><b>The assistant asks:</b> {result.question}</p>}
          {result?.calls && result.calls.length > 0 && (
            <details className="qloo-trace">
              <summary>What the agent asked Qloo ({result.calls.length} calls)</summary>
              <ul>{traceRows(result.calls).map((r) => <li key={r.key}><code>{r.endpoint}</code>{r.what && <span>{r.what}</span>}<b>×{r.n}</b></li>)}</ul>
            </details>
          )}
        </section>

        <section className="lb-owner">
          <p className="lb-label"><span>2</span> The shop owner</p>
          <div className="lb-gauge">
            <b>{pct(cov)}</b>
            <div><strong>taste coverage</strong><small>Share of what shoppers&apos; tastes love most that is on the shelves. {rows.length} requests so far.</small></div>
            {delta !== null && delta > 0 && <em key={added.length} className="delta">+{(delta * 100).toFixed(1)} pts</em>}
          </div>
          {result?.gap ? (
            <div className="lb-demand">
              <p className="lb-big"><b>{owned} of {wantedN}</b> titles this taste loves most are in stock{stockedNow ? <> (+{stockedNow} you just stocked)</> : null}. The rest just became demand:</p>
              <div className="ghosts">
                {missing.slice(0, 6).map((w, i) => (
                  <button key={w.entity_id} type="button" className="ghost-cover" style={{ animationDelay: `${i * 120}ms` }} disabled={placing} onClick={() => restock(w)} title={`Stock ${w.name}`}>
                    <Cover src={w.image} name={w.name} type={w.type} />
                    <small>{w.name}</small>
                  </button>
                ))}
              </div>
              {placing ? <p className="lb-note placing">Placing it on the store map with Qloo (36 reference tastes)…</p> : missing.length > 0 && <p className="lb-note">Tap one to stock it: Qloo places it on the store map and coverage goes up.</p>}
            </div>
          ) : (
            <p className="lb-wait">Waiting for a request. When the assistant checks the shelves, the titles we don&apos;t carry land here.</p>
          )}
          {landed && <p className="landed"><b>{landed}</b></p>}
          <Link href="/owner" className="lb-link">Open the full owner view →</Link>
        </section>
      </div>

      {result && result.picks.length > 0 && (
        <section className="lb-picks">
          <h2>Pulled for this shopper</h2>
          <div className="lb-pick-row">
            {result.picks.map((p) => (
              <Link key={p.item.id} href={`/item/${p.item.id}`} className="lb-pick">
                <div className="lb-pick-art"><img src={`/covers/${p.item.id}.jpg`} alt="" /><span className="price-tag">${p.item.price_usd}</span></div>
                <small>{p.item.category}</small>
                <h3>{p.item.title}</h3>
                {p.why && <p>{p.why}</p>}
                {p.basis && <em className="basis">{p.basis}</em>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="lb-store">
        <div className="lb-store-head">
          <h2>The store, lit by this taste</h2>
          <p>{light
            ? "Every cover in the shop. The ones this taste loves most (Qloo affinity, against titles of the same kind) step forward and glow; the five picks are framed."
            : "All 384 titles, placed by who loves them. Ask, and the titles this taste loves step forward and glow."}</p>
        </div>
        <LightMap light={light} picks={result?.picks.map((p) => p.item.id) ?? []} pins={pins} />
      </section>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
