"use client";
import { passHeaders } from "@/app/components/pass";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "@/data/examples";
import type { AgentResult, Pick } from "@/lib/agent/run";
import { Header } from "@/app/components/Header";
import { LightMap } from "@/app/components/LightMap";
import { HowItWorks } from "@/app/components/HowItWorks";
import { ShopByTaste } from "@/app/components/ShopByTaste";
import { ChainCard } from "@/app/components/ChainCard";
import Link from "next/link";
import real from "@/data/real/waterloo.json";
import { addedTitles, coverage, fmtPct, myDemand, recordDemand, seedDemand, suggestions, type DemandRow } from "@/lib/cycle";

// An empty box still works: Find picks runs the example in the placeholder.
const PLACEHOLDER = "My cousin quotes Tarantino and plays The Last of Us. Under $60.";

// Plain-language reason for a pick: no affinity scores or standard deviations on the shopper side.
function reason(p: Pick): string {
  if (p.direct.length) return `By ${p.direct.join(" and ")}, straight from your request.`;
  const lead = p.chain[0];
  if (!lead) return "A strong match for the tastes you described.";
  const strength = (p.lift ?? 0) >= 3 ? "A favourite" : (p.lift ?? 0) >= 1.5 ? "Big" : "Popular";
  return `${strength} with fans of ${lead.signal}, far more than with the average shopper.`;
}

export default function Page() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shelf = useRef<HTMLElement>(null);
  // The owner's numbers for the hero: the demo demand plus this visitor's own requests.
  const [mine, setMine] = useState<DemandRow[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => { setMine(myDemand()); setAdded(new Set(addedTitles().map((a) => a.entity_id))); }, [result]);
  const rows = [...seedDemand, ...mine];
  const lost = 1 - coverage(rows, added);
  const missingTitles = suggestions(rows, added).length;
  // The answer lands below the fold: bring it into view so "Find picks" visibly did something.
  useEffect(() => { if (result) shelf.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [result]);

  async function run(message: string) {
    setText(message);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST", headers: passHeaders(), body: JSON.stringify({ message }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
      if (data.gap && !data.paused) recordDemand({ message, signals: data.extraction.signals.map((x: { name: string }) => x.name), wanted: data.gap.wanted });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const pausedInfo = (result as { paused?: { note: string; request: string } } | null)?.paused; // live mode closed: a recorded run stands in
  const picked = new Set(result?.picks.map((p) => p.item.id) ?? []);
  const light = result?.steps.find((s) => s.light)?.light ?? null;

  return (
    <main className="shop">
      <Header side="shopper" />

      <section className="band has-photo home-band">
        <p className="lb-kicker">A record, book and film shop run by two Claude agents on Qloo</p>
        <h1>Your shop sees what sold. Afterglow sees what walked out.</h1>
        <p className="lb-lede">A shopper says who the gift is for, and the assistant picks five titles from the shelves. Every title it could not find goes on the owner&apos;s restock list, so the shop finally learns what walked out. We ran it on a real record store first.</p>
        <dl className="hero-stats">
          <div><dt>{real.local.top.length - real.local.on_shelf} of {real.local.top.length}</dt><dd>artists Austin loves most (Qloo location data) are missing from the 500 best-sellers of Waterloo Records, a real Austin shop. <Link href="/real">See the gap →</Link></dd></div>
          <div><dt>0 vs 12</dt><dd>gift picks over the shopper&apos;s budget across 40 blind requests: our agent vs Claude alone. <a href="https://github.com/DmitriyTopka/afterglow#how-well-it-works-measured-not-tuned-on-the-test">How we counted →</a></dd></div>
          <div><dt>{real.recognised} of {real.names}</dt><dd>artists on that shop&apos;s best-seller list that Qloo, the taste-data API we build on, recognises</dd></div>
        </dl>
        <form className="lb-ask" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); run(text.trim() || PLACEHOLDER); }}>
          <label htmlFor="ask" className="sr-only">What are they into?</label>
          <textarea id="ask" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={PLACEHOLDER} />
          <button className="lb-go" disabled={busy}>{busy ? "Digging…" : "Find the gift"}</button>
        </form>
        {error && <p className="error">{error}</p>}
        {pausedInfo && <p className="lb-note">{pausedInfo.note} Recorded request: “{pausedInfo.request}”</p>}
        <div className="lb-tabs scroll-x" style={{ marginTop: 14 }}>
          <span>Or watch one:</span>
          {EXAMPLES.slice(0, 3).map((ex, i) => <Link key={ex.label} href={`/live?ex=${i}`} className="lb-tab">{ex.label}</Link>)}
        </div>
        <p className="band-links">
          <Link href="/owner" className="pill">Open the owner&apos;s restock plan →</Link>
          <Link href="/real" className="pill light">See it on a real shop →</Link>
          <Link href="/live" className="band-link">Watch both sides at once →</Link>
        </p>
        <ChainCard />
      </section>

      <section className="proof-strip" aria-label="Why it matters">
        <div><b>$1.04B</b><span>US vinyl sales in 2025, up 9.3% (RIAA). Indie shops sell a share of it, blind to who walked out.</span></div>
        <div><b>{fmtPct(lost)}</b><span>simulated: of what our demo shoppers&apos; tastes love, this share is not on the demo store&apos;s shelves ({missingTitles} titles)</span></div>
        <div><b>{rows.length}</b><span>shopper requests so far: simulated demand from 38 test shoppers written blind{mine.length ? `, plus ${mine.length} of yours` : ", plus yours once you ask"}</span></div>
        <div><b>10 vs 4</b><span>blind requests our agent won vs lost against Claude alone, 6 ties, 20 we never tuned on. A small sample, not yet significant.</span></div>
      </section>

      {result && (
        <section className="blk blk-amber results-b" ref={shelf}>
          <h2>Pulled for you</h2>
          {"question" in result && result.question ? (
            <p className="ask-back"><b>The assistant asks:</b> {String(result.question)}</p>
          ) : result.picks.length === 0 && <p className="sub">Nothing to anchor on yet. Name an artist, a film, a book or a game.</p>}
          {result.gap && (
            <p className="sub">
              Store check: we carry <b>{result.gap.wanted.filter((w) => w.owned).length} of the {result.gap.wanted.length}</b> titles this taste loves most.
              {result.gap.wanted.some((w) => !w.owned) && <> The rest ({result.gap.wanted.filter((w) => !w.owned).slice(0, 2).map((w) => w.name).join(", ")}…) went to the shop owner as unmet demand. <Link href="/owner">See what the owner sees</Link></>}
            </p>
          )}
          <div className="lb-pick-row">
            {result.picks.map((p) => (
              <Link key={p.item.id} href={`/item/${p.item.id}`} className="lb-pick">
                <div className="lb-pick-art"><img src={`/covers/${p.item.id}.jpg`} alt="" /><span className="price-tag">${p.item.price_usd}</span></div>
                <small>{p.item.category}</small>
                <h3>{p.item.title}</h3>
                <p>{p.why || reason(p)}</p>
                {p.basis && <em className="basis">{p.basis}</em>}
              </Link>
            ))}
          </div>
          <details className="how-picked">
            <summary>How the assistant got there ({result.steps.length} steps, {result.calls.length} Qloo calls)</summary>
            <ol>{result.steps.map((s, i) => <li key={i} className={s.status}>{s.label}</li>)}</ol>
          </details>
        </section>
      )}

      <ShopByTaste />

      <section className="blk blk-cream">
        <div className="blk-head">
          <h2>The whole store, placed by who loves it</h2>
          <p>Every cover sits next to the titles its fans also love, from Qloo taste data. {result ? "The titles your taste loves step forward and glow; your five picks are framed." : "Ask above, and the titles that taste loves step forward and glow."} <Link href="/map">Browse by section →</Link></p>
        </div>
        <LightMap light={light} picks={[...picked]} />
      </section>

      <HowItWorks />

      <footer className="foot">
        Built on Qloo taste data (search and insights) and Claude Haiku. Taste data describes groups of people with similar
        interests, never one person. The store and its prices are made up.
      </footer>
    </main>
  );
}
