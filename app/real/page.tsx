// "A real shelf": Afterglow run on a real independent record shop's public catalog (Waterloo Records, Austin TX).
// All numbers come from data/real/waterloo.json, built by scripts/real_shelf.mts from Qloo search and insights.
import Link from "next/link";
import { Header } from "@/app/components/Header";
import data from "@/data/real/waterloo.json";

export const metadata = { title: "A real shelf · Afterglow" };
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(0)}%`;
// Qloo lists an artist and their band separately ("Lukas Nelson", "Lukas Nelson & Promise of the Real"); show one row.
const AUSTIN = data.austin.top.filter((a, i, all) => !all.slice(0, i).some((b) => a.name.startsWith(`${b.name} `)));

export default function RealShelf() {
  const s = data.shoppers;
  const leftEmpty = s.rows - s.served;
  return (
    <main className="shop">
      <Header side="owner" />
      <section className="band band-short">
        <p className="lb-kicker">Waterloo Records, Austin TX · public catalog, no affiliation</p>
        <h1>A real shop, run through Afterglow.</h1>
        <p className="lb-lede">We took the 500 best-selling items from a real independent record store&apos;s public catalog and asked Qloo two questions: does this shelf fit its city, and does it fit the shoppers who walk in?</p>
        <dl className="hero-stats">
          <div><dt>{data.recognised} of {data.artists}</dt><dd>artists on this shelf Qloo knows ({pct(data.recognised, data.artists)})</dd></div>
          <div><dt>{data.austin.on_shelf} of {data.austin.top.length}</dt><dd>artists Austin&apos;s taste over-indexes on (per Qloo) are in this best-seller list</dd></div>
          <div><dt>{leftEmpty} of {s.rows}</dt><dd>of our music shoppers would find nothing their taste loves most here</dd></div>
        </dl>
      </section>

      <section className="blk blk-cream">
        <div className="blk-head"><h2>Does the shelf fit the city?</h2><p>Qloo&apos;s location signal returns the artists Austin loves more than elsewhere. Here are the first 24 of the {data.austin.top.length} Qloo returns; marked are the ones in Waterloo&apos;s 500 best-sellers. This is a best-seller list, not the whole store, so a missing name means it doesn&apos;t sell in the top 500, not that it isn&apos;t stocked.</p></div>
        <ol className="real-list">
          {AUSTIN.slice(0, 24).map((a, i) => (
            <li key={a.entity_id} className={a.on_shelf ? "on" : ""}><span>{i + 1}</span>{a.name}{a.on_shelf && <em>in the best-sellers</em>}</li>
          ))}
        </ol>
      </section>

      <section className="blk blk-ink">
        <div className="blk-head"><h2>Does it fit the shoppers?</h2><p>Our {s.rows} demo shoppers with music tastes, measured against this shelf instead of ours. For each, Qloo lists the 10 records their taste loves most.</p></div>
        <div className="real-grid">
          <div className="real-card"><b>{s.carried} of {s.wanted}</b><span>records these tastes love most are on the shelf ({pct(s.carried, s.wanted)})</span></div>
          <div className="real-card"><b>{s.served} of {s.rows}</b><span>shoppers would find at least one</span></div>
          <div className="real-card"><b>~${Math.round(leftEmpty * data.median_price)}</b><span>walks out with the other {leftEmpty}, at this list&apos;s median price of ${data.median_price} per record. A rough estimate, one record each.</span></div>
        </div>
        <h3 className="real-h3">What these shoppers asked for and this shelf doesn&apos;t have</h3>
        <ol className="real-missing">{s.missing.slice(0, 12).map((m) => <li key={m.name}><b>{m.name}</b> <span>wanted by {m.askedBy} shopper{m.askedBy > 1 ? "s" : ""}</span></li>)}</ol>
      </section>

      <section className="blk blk-amber">
        <div className="blk-head"><h2>How we did it</h2><p>{data.source} {data.artists} Qloo searches (one per artist name; a name Qloo spells differently counts as unknown), one Qloo insights call with <code>signal.location.query=Austin, TX</code>, and the same demand our owner&apos;s agent reads. Only artist names, counts and prices were used; no listings are copied. Script: <code>scripts/real_shelf.mts</code>.</p></div>
        <p className="band-links"><Link href="/owner" className="pill">Measure your own shelf →</Link><Link href="/live" className="band-link">Watch the agents work →</Link></p>
      </section>
    </main>
  );
}
