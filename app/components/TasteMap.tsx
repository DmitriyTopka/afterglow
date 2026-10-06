"use client";
// The taste map: every catalog cover at its precomputed position (data/taste_map.json).
// Hover a sleeve for its price sticker; click a crate divider to zoom into that section.
import { useState } from "react";
import catalog from "@/data/catalog.json";
import map from "@/data/taste_map.json";
import { Cover } from "./Cover";

const POS = map.items as Record<string, { x: number; y: number; cluster: number }>;
const ITEMS = catalog.items as Array<{ id: string; title: string; category: string; price_usd: number }>;
const CLUSTERS = map.clusters as Array<{ id: number; name?: string; size: number; x: number; y: number; radius: number }>;
// Positions are fractions of a 3:2 board (scripts/build_map.py); radius is in board-width units.
const X = (x: number) => x * 100;
const Y = (y: number) => y * 100;
const BELOW = (c: { y: number; radius: number }) => Math.min(Y(c.y) + (c.radius / (2 / 3)) * 100 + 4.5, 97);

export interface Pin { id: string; x: number; y: number; image: string; label: string }

export function TasteMap({ active, onSection, pins = [], highlight }: {
  active?: number | null; onSection?: (id: number | null) => void; pins?: Pin[]; highlight?: Set<string>;
}) {
  const [zoom, setZoom] = useState(false);
  const [own, setOwn] = useState<number | null>(null); // used when the caller does not control the section
  const current = active !== undefined ? active : own;
  const focus = current !== null ? CLUSTERS.find((c) => c.id === current) : undefined;
  const zoomed = zoom && focus;
  const layer = zoomed
    ? { transformOrigin: `${X(focus.x)}% ${Y(focus.y)}%`, transform: `translate(${50 - X(focus.x)}%, ${50 - Y(focus.y)}%) scale(2.3)` }
    : undefined;

  return (
    <div className={`board${zoomed ? " is-zoomed" : ""}`}>
      <div className="board-layer" style={layer}>
        {ITEMS.map((it) => {
          const p = POS[it.id];
          if (!p) return null;
          const dim = (focus && p.cluster !== focus.id) || (highlight && highlight.size > 0 && !highlight.has(it.id));
          const lit = highlight?.has(it.id);
          return (
            <figure key={it.id} className={`sleeve${dim ? " dim" : ""}${lit ? " lit" : ""}`} style={{ left: `${X(p.x)}%`, top: `${Y(p.y)}%` }}>
              <a href={`/item/${it.id}`} aria-label={it.title}><img src={`/covers/${it.id}.jpg`} alt={it.title} loading="lazy" /></a>
              <figcaption className="sticker"><b>{it.title}</b><span>{it.category} · ${it.price_usd}</span></figcaption>
            </figure>
          );
        })}
        {pins.map((p) => (
          <figure key={p.id} className="sleeve pin" style={{ left: `${X(p.x)}%`, top: `${Y(p.y)}%` }}>
            <Cover src={p.image} name={p.label} alt={p.label} />
            <figcaption className="sticker"><b>{p.label}</b><span>New arrival</span></figcaption>
          </figure>
        ))}
        {CLUSTERS.map((c) => (
          <button key={c.id} type="button" className={`divider${focus?.id === c.id ? " on" : ""}`}
            style={{ left: `${X(c.x)}%`, top: `${BELOW(c)}%` }}
            onClick={() => { setOwn(c.id); onSection?.(c.id); setZoom(true); }}>
            {c.name}<small>{c.size}</small>
          </button>
        ))}
      </div>
      {zoomed && <button type="button" className="unzoom" onClick={() => { setZoom(false); setOwn(null); }}>Show the whole store</button>}
    </div>
  );
}

// Phones get the same sections as crates you flick through, instead of a map too small to read.
export function CrateList({ onSection }: { onSection?: (id: number) => void }) {
  return (
    <div className="crates">
      {CLUSTERS.map((c) => (
        <section key={c.id} className="crate">
          <button type="button" className="divider static" onClick={() => onSection?.(c.id)}>{c.name}<small>{c.size}</small></button>
          <div className="crate-row">
            {ITEMS.filter((it) => POS[it.id]?.cluster === c.id).slice(0, 14).map((it) => (
              <a key={it.id} href={`/item/${it.id}`}><img src={`/covers/${it.id}.jpg`} alt={it.title} title={it.title} loading="lazy" /></a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
