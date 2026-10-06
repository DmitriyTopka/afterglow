// Product page: the title, its price, who made it, and what its fans also love (taste neighbours from Qloo data).
import Link from "next/link";
import { notFound } from "next/navigation";
import catalog from "@/data/catalog.json";
import map from "@/data/taste_map.json";
import sizes from "@/data/cover_sizes.json";
import colors from "@/data/cover_colors.json";
import { Header } from "@/app/components/Header";
import { similar } from "@/lib/similar";
import { AddToCart } from "./AddToCart";

type Item = { id: string; title: string; category: string; price_usd: number; creators: string[]; works: string[]; blurb?: string; year?: string };
const ITEMS = catalog.items as Item[];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
const LARGE = sizes as Record<string, number[]>;
// Never wider than the source (stays sharp) and never taller than 520px (portrait book covers).
const frameWidth = (id: string) => { const s = LARGE[id]; return s ? Math.min(s[0], Math.round((520 * s[0]) / s[1])) : 240; };
// Catalog blurbs were stored cut at 200 characters: end on the last full sentence, or on a word with an ellipsis.
function tidy(b: string) {
  const t = b.trim();
  if (/[.!?")]$/.test(t)) return t;
  const end = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "));
  return end > 60 ? t.slice(0, end + 1) : t.replace(/\s+\S*$/, "") + "…";
}
const SECTION = new Map((map.clusters as Array<{ id: number; name?: string; line?: string }>).map((c) => [c.id, c]));

export function generateStaticParams() { return ITEMS.map((i) => ({ id: i.id })); }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${BY_ID.get(id)?.title ?? "Title"} · Afterglow` };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = BY_ID.get(id);
  if (!it) notFound();
  const pos = (map.items as Record<string, { cluster: number }>)[id];
  const section = pos ? SECTION.get(pos.cluster) : undefined;
  const pairs = similar(id, 4).map((s) => BY_ID.get(s.id)).filter(Boolean) as Item[];
  return (
    <main className="shop">
      <Header side="shopper" />
      <section className="blk blk-cream product-blk">
      <nav className="crumbs"><Link href="/">Store</Link> / {section?.name ?? it.category}</nav>
      <article className="product">
        <div className="product-art">
          {/* Full artwork at its own shape (book covers stay portrait), never wider than the source so it stays sharp. */}
          <span className="art-frame" style={{ maxWidth: frameWidth(id), ["--cover-glow" as string]: (colors as Record<string, string>)[id] }}>
          {LARGE[it.id]
            ? <img src={`/covers-lg/${it.id}.webp`} alt={it.title} width={LARGE[it.id][0]} height={LARGE[it.id][1]} />
            : <img src={`/covers/${it.id}.jpg`} alt={it.title} />}
          <span className="price-tag big">${it.price_usd}</span>
          </span>
        </div>
        <div className="product-info">
          <p className="pick-cat">{it.category}{it.year ? ` · ${it.year}` : ""}</p>
          <h1>{it.title}</h1>
          {it.creators.length > 0 && <p className="by">By {it.creators.slice(0, 3).join(", ")}</p>}
          {it.blurb && <p className="blurb">{tidy(it.blurb)}</p>}
          {section && (
            <p className="shelf-note">Shelved in <b>{section.name}</b>: {section.line}</p>
          )}
          <AddToCart id={it.id} />
          <p className="fine">Demo store: prices are made up and checkout charges nothing.</p>
        </div>
      </article>
      </section>
      <section className="blk blk-amber">
        <div className="blk-head"><h2>Fans of this also love</h2><p>Closest titles by taste: who loves them, per Qloo, across 36 reference tastes. Any format.</p></div>
        <div className="lb-pick-row four">
          {pairs.map((p) => (
            <Link key={p.id} href={`/item/${p.id}`} className="lb-pick">
              <div className="lb-pick-art"><img src={`/covers/${p.id}.jpg`} alt="" /><span className="price-tag">${p.price_usd}</span></div>
              <small>{p.category}</small>
              <h3>{p.title}</h3>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
