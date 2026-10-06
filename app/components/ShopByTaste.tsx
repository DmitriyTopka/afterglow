"use client";
// "Shop by taste": the nine map sections as cards with their own artwork; a card opens the section as a
// window over the page (the section screen), with every title in it.
import Link from "next/link";
import { useEffect, useState } from "react";
import catalog from "@/data/catalog.json";
import map from "@/data/taste_map.json";
import owner from "@/data/owner.json";

type Item = { id: string; title: string; category: string; price_usd: number };
const ITEMS = catalog.items as Item[];
const POS = map.items as Record<string, { cluster: number }>;
const SECTIONS = (map.clusters as Array<{ id: number; name?: string; line?: string; size: number }>).map((c) => ({
  ...c,
  audience: (owner.sections.find((s) => s.id === c.id) as { audience?: { summary: string } } | undefined)?.audience?.summary ?? null,
}));

export function ShopByTaste() {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const sec = SECTIONS.find((s) => s.id === open);
  return (
    <section className="blk blk-ink by-taste">
      <div className="blk-head">
        <h2>Shop by taste</h2>
        <p>Nine sections, grouped by who loves the titles (Qloo), not by format. Records sit next to the films and books their fans also love.</p>
      </div>
      <div className="taste-cards">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="taste-card" onClick={() => setOpen(s.id)}>
            <img src={`/brand/section-${s.id}.jpg`} alt="" loading="lazy" />
            <span className="tc-text"><b>{s.name}</b><small>{s.size} titles</small></span>
          </button>
        ))}
      </div>
      {sec && (
        <div className="modal-veil" role="dialog" aria-modal="true" aria-labelledby="sec-title" onClick={() => setOpen(null)}>
          <div className="section-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head" style={{ backgroundImage: `linear-gradient(90deg, rgba(20,14,17,.92) 30%, rgba(20,14,17,.3)), url(/brand/section-${sec.id}.jpg)` }}>
              <button type="button" className="sm-close" aria-label="Close" onClick={() => setOpen(null)}>Close</button>
              <h2 id="sec-title">{sec.name}</h2>
              <p>{sec.line}</p>
              {sec.audience && <p className="fine">{sec.audience} (Qloo demographics)</p>}
            </div>
            <div className="sm-grid">
              {ITEMS.filter((i) => POS[i.id]?.cluster === sec.id).map((i) => (
                <Link key={i.id} href={`/item/${i.id}`}>
                  <img src={`/covers/${i.id}.jpg`} alt="" loading="lazy" />
                  <span>{i.title}</span>
                  <small>{i.category} · ${i.price_usd}</small>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
