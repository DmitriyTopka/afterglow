"use client";
import { passHeaders } from "@/app/components/pass";
// "Check your own shop": paste what you stock, Qloo resolves each line, and the demo shoppers' demand is
// re-measured against your shelf instead of ours. Nothing is stored; the list lives in this page only.
import { useState } from "react";
import { coverage, fmtPct, suggestions, type DemandRow } from "@/lib/cycle";

const SAMPLE = "Radiohead\nThe Smiths\nKazuo Ishiguro: Never Let Me Go\nSpirited Away\nThe Last of Us\nTwin Peaks";

export function ImportShelf({ rows, demoCoverage }: { rows: DemandRow[]; demoCoverage: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<null | { matched: Array<{ line: string; entity_id: string; name: string }>; unknown: string[] }>(null);

  async function check() {
    setBusy(true); setError(null); setRes(null);
    try {
      const lines = (text.trim() || SAMPLE).split("\n");
      const r = await fetch("/api/import", { method: "POST", headers: passHeaders(), body: JSON.stringify({ lines }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Import failed");
      setRes(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ids = new Set(res?.matched.map((m) => m.entity_id) ?? []);
  const theirs = rows.map((r) => ({ ...r, wanted: r.wanted.map((w) => ({ ...w, owned: ids.has(w.entity_id) })) }));
  const cov = res ? coverage(theirs, new Set()) : 0;
  const next = res ? suggestions(theirs, new Set()).slice(0, 5) : [];
  const served = res ? rows.filter((r) => r.wanted.some((w) => ids.has(w.entity_id))).length : 0; // requests with at least one loved title on this shelf

  return (
    <section className="blk blk-amber import-shelf">
      <div className="blk-head"><h2>Check your own shop</h2><p>Paste up to 30 things you stock, one per line: an artist, film, book, game or show. Qloo finds each one, and the same {rows.length} shopper requests are measured against your shelf.</p></div>
      <div className="imp-grid">
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} aria-label="Titles you stock, one per line" />
          <button type="button" className="btn-big" disabled={busy} onClick={check}>{busy ? "Asking Qloo…" : text.trim() ? "Measure my shelf" : "Measure this sample shelf"}</button>
          <p className="fine">Each line is one live Qloo search. Nothing you paste is stored.</p>
          {error && <p className="error">{error}</p>}
        </div>
        {res && (
          <div className="imp-result">
            <p className="imp-big"><b>{served} of {rows.length}</b> shoppers would find at least one title their taste loves most on your shelf</p>
            <p>Taste coverage: <b>{fmtPct(cov)}</b> <span className="muted-in">(this 384-title demo store: {fmtPct(demoCoverage)})</span></p>
            <p>Qloo recognised <b>{res.matched.length} of {res.matched.length + res.unknown.length}</b> lines{res.unknown.length ? <>; not found: {res.unknown.slice(0, 5).join(", ")}</> : null}.</p>
            {next.length > 0 && <><h3>Stock these next</h3><ol>{next.map((s) => <li key={s.entity_id}><b>{s.name}</b> <span>wanted by {s.askedBy} shopper{s.askedBy > 1 ? "s" : ""}, +{(s.gain * 100).toFixed(1)} pts</span></li>)}</ol></>}
          </div>
        )}
      </div>
    </section>
  );
}
