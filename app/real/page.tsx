// "Real shelves": Afterglow run on real independent record shops' public catalogs (Waterloo Records in Austin,
// Josey Records in Dallas). All numbers come from data/real/<shop>.json, built by scripts/real_shelf.mts from Qloo
// search and insights; only names, counts and prices are kept.
import Link from "next/link";
import { Header } from "@/app/components/Header";
import waterloo from "@/data/real/waterloo.json";
import josey from "@/data/real/josey.json";

export const metadata = { title: "Real shelves · Afterglow" };
const SHOPS = [waterloo, josey];
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(0)}%`;
// Qloo lists an artist and their band separately ("Lukas Nelson", "Lukas Nelson & Promise of the Real"); show one row.
const oneRow = (top: Array<{ entity_id: string; name: string; on_shelf: boolean }>) => top.filter((a, i, all) => !all.slice(0, i).some((b) => a.name.startsWith(`${b.name} `)));
const town = (city: string) => city.split(",")[0];

function Shop({ data }: { data: typeof waterloo }) {
  const s = data.shoppers;
  const leftEmpty = s.rows - s.served;
  return (
    <>
      <section className="blk blk-cream" id={data.key}>
        <div className="blk-head"><h2>{town(data.city)}: does the shelf fit the city?</h2><p><b>{data.shop}.</b> Qloo&apos;s location signal returns the artists {town(data.city)} loves more than elsewhere. Here are the first 24 of the {data.local.top.length}; marked are the ones in the shop&apos;s {data.label}. This is a slice of the catalog, not the whole store: a name outside it is either not stocked or not selling to the people who love it, and either way it is demand the shop&apos;s sales don&apos;t show.</p></div>
        <ol className="real-list">
          {oneRow(data.local.top).slice(0, 24).map((a, i) => (
            <li key={a.entity_id} className={a.on_shelf ? "on" : ""}><span>{i + 1}</span>{a.name}{a.on_shelf && <em>on the shelf</em>}</li>
          ))}
        </ol>
      </section>
      <section className="blk blk-ink">
        <div className="blk-head"><h2>Does {data.shop.split(" ")[0]} fit the shoppers?</h2><p>Our {s.rows} demo shoppers with music tastes (simulated demand), measured against this shelf instead of ours. For each, Qloo lists the 10 records their taste loves most.</p></div>
        <div className="real-grid">
          <div className="real-card"><b>{s.carried} of {s.wanted}</b><span>records these tastes love most are on the shelf ({pct(s.carried, s.wanted)})</span></div>
          <div className="real-card"><b>{s.served} of {s.rows}</b><span>shoppers would find at least one</span></div>
          <div className="real-card"><b>~${Math.round(leftEmpty * data.median_price)}</b><span>walks out with the other {leftEmpty}, at the median price of ${data.median_price} per record. A rough estimate, one record each.</span></div>
        </div>
        <h3 className="real-h3">What these shoppers asked for and this shelf doesn&apos;t have</h3>
        <ol className="real-missing">{s.missing.slice(0, 12).map((m) => <li key={m.name}><b>{m.name}</b> <span>wanted by {m.askedBy} shopper{m.askedBy > 1 ? "s" : ""}</span></li>)}</ol>
      </section>
    </>
  );
}

export default function RealShelf() {
  return (
    <main className="shop">
      <Header side="owner" />
      <section className="band band-short">
        <p className="lb-kicker">Two independent record shops · public catalogs, no affiliation</p>
        <h1>Real shops, run through Afterglow.</h1>
        <p className="lb-lede">We took the public catalogs of two real independent record stores in two cities and asked Qloo two questions: does this shelf fit its city, and does it fit the shoppers who walk in?</p>
        <div className="real-table-wrap">
          <table className="real-table">
            <thead><tr><th>Shop</th><th>Qloo knows the artist</th><th>City&apos;s 50 favourite artists on the shelf</th><th>Demo shoppers who&apos;d find something</th></tr></thead>
            <tbody>
              {SHOPS.map((d) => (
                <tr key={d.key}>
                  <td><a href={`#${d.key}`}><b>{d.shop}</b></a><small>{d.city} · {d.label}</small></td>
                  <td><b>{d.recognised} of {d.names}</b> ({pct(d.recognised, d.names)})</td>
                  <td><b>{d.local.on_shelf} of {d.local.top.length}</b></td>
                  <td><b>{d.shoppers.served} of {d.shoppers.rows}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="real-quotes">
          <figure><blockquote>&ldquo;If we don&apos;t have what customers want, we&apos;ll order it, plus an extra copy.&rdquo;</blockquote><figcaption>Bob Larsen, Sound Station record shop, New Jersey. <a href="https://patch.com/new-jersey/scotchplains/slinging-vinyl-in-a-digital-age">Patch, 2010</a></figcaption></figure>
          <figure><blockquote>&ldquo;It&apos;s like having 100 book buyers a week helping curate the inventory.&rdquo;</blockquote><figcaption>Josie Leavitt, bookseller, on special orders. <a href="https://blogs.publishersweekly.com/blogs/shelftalker/?p=18348">Publishers Weekly ShelfTalker, 2016</a></figcaption></figure>
          <p>Shops already restock from what customers ask for out loud. Afterglow records what they never get to ask: the titles a shopper&apos;s taste loves that were not on the shelf.</p>
        </div>
      </section>

      {SHOPS.map((d) => <Shop key={d.key} data={d} />)}

      <section className="blk blk-amber">
        <div className="blk-head"><h2>How we did it</h2><p>
          {SHOPS.map((d) => <span key={d.key}>{d.source} </span>)}
          One Qloo search per artist name (a name Qloo spells differently counts as unknown), one Qloo insights call per city with <code>signal.location.query</code>, and the same demand our owner&apos;s agent reads. Only artist names, counts and prices were used; no listings are copied. We also tried two more shops and left them out: one feed opened with exclusive variants rather than its regular stock, and a bookshop&apos;s best-seller titles matched Qloo by exact name only 6 times in 29. Script: <code>scripts/real_shelf.mts</code>.
        </p></div>
        <p className="band-links"><Link href="/owner" className="pill">Measure your own shelf →</Link><Link href="/live" className="band-link">Watch the agents work →</Link></p>
      </section>
    </main>
  );
}
