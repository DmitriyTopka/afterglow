"use client";

import { useState } from "react";
import { EXAMPLES } from "@/data/examples";
import type { AgentResult, Pick } from "@/lib/agent/run";
import { Header } from "@/app/components/Header";
import { CrateList, TasteMap } from "@/app/components/TasteMap";
import { HowItWorks } from "@/app/components/HowItWorks";
import Link from "next/link";
import { recordDemand } from "@/lib/cycle";

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

  async function run(message: string) {
    setText(message);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
      if (data.gap) recordDemand({ message, signals: data.extraction.signals.map((x: { name: string }) => x.name), wanted: data.gap.wanted });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const picked = new Set(result?.picks.map((p) => p.item.id) ?? []);

  return (
    <main className="shop">
      <Header side="shopper" />

      <section className="hero">
        <h1>Say what they&apos;re into.<br />We&apos;ll pull it from the crates.</h1>
        <p className="lede">
          Name a few films, artists, books or games. The shop assistant reads the taste behind them and picks across the
          whole store, not just the shelf you named.
        </p>
        <div className="tabs" role="list">
          {EXAMPLES.map((ex) => (
            <button key={ex.label} role="listitem" className="tab" disabled={busy} onClick={() => run(ex.text)}>{ex.label}</button>
          ))}
        </div>
        <form className="ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(text); }}>
          <label htmlFor="ask" className="sr-only">What are they into?</label>
          <textarea id="ask" value={text} onChange={(e) => setText(e.target.value)} placeholder="My cousin quotes Tarantino and plays The Last of Us. Under $60." />
          <button className="go" disabled={busy || !text.trim()}>{busy ? "Digging…" : "Find picks"}</button>
        </form>
        {error && <p className="error">{error}</p>}
        <Link href="/live" className="door live-door">
          <span className="eyebrow">See it work</span>
          <b>Watch the shopper and the owner side by side</b>
          <span>The agent's steps arrive live; the owner sees the unmet demand a moment later.</span>
        </Link>
        <Link href="/owner" className="door">
          <span className="eyebrow">Run a shop?</span>
          <b>See your shelves through your shoppers&apos; taste</b>
          <span>Coverage, what to stock next, and new titles that find their own place. Built on Qloo.</span>
        </Link>
      </section>

      {result && (
        <section className="results">
          <div className="shelf">
            <h2>Pulled for you</h2>
            {"question" in result && result.question ? (
              <p className="ask-back"><b>The assistant asks:</b> {String(result.question)}</p>
            ) : result.picks.length === 0 && <p className="empty">Nothing to anchor on yet. Name an artist, a film, a book or a game.</p>}
            {result.gap && (
              <p className="store-check">
                Store check: we carry <b>{result.gap.wanted.filter((w) => w.owned).length} of the {result.gap.wanted.length}</b> titles this taste loves most.
                {result.gap.wanted.some((w) => !w.owned) && <> The rest ({result.gap.wanted.filter((w) => !w.owned).slice(0, 2).map((w) => w.name).join(", ")}…) went to the shop owner as unmet demand. <Link href="/owner">See what the owner sees</Link></>}
              </p>
            )}
            <div className="shelf-row">
              {result.picks.map((p) => (
                <Link key={p.item.id} href={`/item/${p.item.id}`} className="pick">
                  <div className="pick-art">
                    <img src={`/covers/${p.item.id}.jpg`} alt="" />
                    <span className="price-tag">${p.item.price_usd}</span>
                  </div>
                  <h3>{p.item.title}</h3>
                  <p className="pick-cat">{p.item.category}</p>
                  <p className="pick-why">{p.why || reason(p)}</p>
                </Link>
              ))}
            </div>
          </div>
          <aside className="receipt" aria-label="What the agent did">
            <h2>Receipt</h2>
            <ol>
              {result.steps.map((s, i) => (
                <li key={i} className={s.status}>{s.label}</li>
              ))}
            </ol>
            <p className="receipt-foot">{result.calls.length} Qloo calls · {result.modes.llm === "agent" ? `agent, ${"turns" in result ? String(result.turns) : "?"} model turns` : `Claude ${result.modes.llm}`}</p>
          </aside>
        </section>
      )}

      <section className="store">
        <div className="store-head">
          <h2>The whole store, placed by who loves it</h2>
          <p>Every cover sits next to the titles its fans also love, from Qloo taste data. Click a section to step into it.{result ? " Your picks are lit." : ""}</p>
        </div>
        <TasteMap highlight={picked} />
        <CrateList />
      </section>

      <HowItWorks />

      <footer className="foot">
        Built on Qloo taste data (search and insights) and Claude Haiku. Taste data describes groups of people with similar
        interests, never one person. The store and its prices are made up.
      </footer>
    </main>
  );
}
