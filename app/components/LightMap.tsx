"use client";
// The live screen's store map, drawn on one canvas from one sprite atlas (public/brand/atlas.webp).
// The store starts in full colour. When the agent scores the catalog, the titles this shopper's taste loves most
// (Qloo affinity percentile within their format) step forward, grow and glow; the rest settle back; the picks are framed.
import { useEffect, useRef } from "react";
import map from "@/data/taste_map.json";
import atlas from "@/data/atlas.json";
import { Cover } from "./Cover";
import type { Pin } from "./TasteMap";

const POS = map.items as Record<string, { x: number; y: number; cluster: number }>;
const CLUSTERS = map.clusters as Array<{ id: number; name?: string; size: number; x: number; y: number; radius: number }>;
const IDX = atlas.index as Record<string, number>;
const IDS = Object.keys(POS).filter((id) => id in IDX);
const S = atlas.size;
const COLS = atlas.cols;
const IDLE = 0.9; // the store before anyone asks: every cover in full colour
const RISE = 1500; // ms for the whole store to light up
const BELOW = (c: { y: number; radius: number }) => Math.min(c.y * 100 + (c.radius / (2 / 3)) * 100 + 4.5, 97);

// Percentile -> brightness. Steep, so only what this taste really loves glows; the rest stays in the dark.
const shade = (l: number) => Math.pow(l, 5);

export function LightMap({ light, picks = [], pins = [] }: { light: Record<string, number> | null; picks?: string[]; pins?: Pin[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const state = useRef({ img: null as HTMLImageElement | null, glow: null as HTMLCanvasElement | null, cur: new Map<string, number>(), from: new Map<string, number>(), start: 0, raf: 0, picks: new Set<string>(), target: new Map<string, number>(), on: false });

  useEffect(() => {
    const st = state.current;
    const g = document.createElement("canvas");
    g.width = g.height = 64;
    const gc = g.getContext("2d")!;
    const grad = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 178, 80, .9)");
    grad.addColorStop(0.4, "rgba(242, 150, 60, .35)");
    grad.addColorStop(1, "rgba(242, 150, 60, 0)");
    gc.fillStyle = grad;
    gc.fillRect(0, 0, 64, 64);
    st.glow = g;
    const img = new Image();
    img.src = "/brand/atlas.webp";
    img.onload = () => { st.img = img; draw(); };
    for (const id of IDS) st.cur.set(id, IDLE);
    const ro = new ResizeObserver(() => draw());
    if (wrap.current) ro.observe(wrap.current);
    return () => { ro.disconnect(); cancelAnimationFrame(st.raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const st = state.current;
    st.picks = new Set(picks);
    st.on = !!light;
    st.target = new Map(IDS.map((id) => [id, light ? 0.42 + 0.58 * shade(light[id] ?? 0) : IDLE]));
    for (const id of picks) if (light) st.target.set(id, 1);
    st.from = new Map(st.cur);
    st.start = performance.now();
    cancelAnimationFrame(st.raf);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { st.cur = new Map(st.target); draw(); return; }
    const tick = () => {
      const t = performance.now() - st.start;
      let moving = false;
      for (const id of IDS) {
        const to = st.target.get(id)!;
        const from = st.from.get(id)!;
        // Brightest titles light first; a dimming store fades all at once.
        const delay = to > from ? (1 - to) * RISE * 0.6 : 0;
        const k = Math.min(1, Math.max(0, (t - delay) / (RISE * 0.4)));
        if (k < 1) moving = true;
        const e = 1 - Math.pow(1 - k, 3);
        st.cur.set(id, from + (to - from) * e);
      }
      draw();
      if (moving) st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light, picks.join(",")]);

  function draw() {
    const st = state.current;
    const c = cvs.current, w = wrap.current;
    if (!c || !w || !st.img) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = w.clientWidth, H = W * (2 / 3);
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const size = W * 0.018;
    const order = [...IDS].sort((a, b) => st.cur.get(a)! - st.cur.get(b)!); // lit covers drawn on top
    for (const id of order) {
      const b = st.cur.get(id)!;
      const p = POS[id];
      const pick = st.picks.has(id) && b > 0.6;
      const lit = st.on ? Math.max(0, (b - 0.42) / 0.58) : 0; // how far this cover stepped forward
      const s = pick ? size * 3 : size * (1 + lit * 0.9);
      const x = p.x * W, y = p.y * H;
      if (lit > 0.35 && st.glow) {
        const r = s * (pick ? 3.6 : 2.6);
        ctx.globalAlpha = Math.min(1, (lit - 0.35) * (pick ? 1.6 : 1.1));
        ctx.drawImage(st.glow, x - r / 2, y - r / 2, r, r);
      }
      const k = IDX[id];
      ctx.globalAlpha = Math.min(1, 0.15 + b);
      ctx.drawImage(st.img, (k % COLS) * S, Math.floor(k / COLS) * S, S, S, x - s / 2, y - s / 2, s, s);
      if (pick) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#f2b04a";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  return (
    <div className="lightmap" ref={wrap}>
      <canvas ref={cvs} aria-label={light ? "Store map lit by this shopper's taste" : "Store map, waiting for a request"} role="img" />
      {CLUSTERS.map((c) => (
        <span key={c.id} className="divider static-label" style={{ left: `${Math.min(86, Math.max(14, c.x * 100))}%`, top: `${BELOW(c)}%` }}>{c.name}</span>
      ))}
      {pins.map((p) => (
        <figure key={p.id} className="sleeve pin" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
          <Cover src={p.image} name={p.label} alt={p.label} />
          <figcaption className="sticker"><b>{p.label}</b><span>New arrival</span></figcaption>
        </figure>
      ))}
    </div>
  );
}
