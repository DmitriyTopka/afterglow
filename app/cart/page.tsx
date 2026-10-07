"use client";
import { passHeaders } from "@/app/components/pass";
// Bag and checkout on one screen (demo: nothing is charged). The "who is it for" note is a taste signal:
// on checkout the agent reads it, checks the store, and the gaps reach the owner's side.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import catalog from "@/data/catalog.json";
import { Header } from "@/app/components/Header";
import { readCart, removeFromCart, writeCart, addToCart, type CartLine } from "@/lib/cart";
import { completeTheGift } from "@/lib/similar";
import { recordDemand } from "@/lib/cycle";

type Item = { id: string; title: string; category: string; price_usd: number };
const BY_ID = new Map((catalog.items as Item[]).map((i) => [i.id, i]));
const WRAP = 4;

interface Confirm { order: string; total: number; learned: { carried: number; total: number; missing: string[] } | null; error?: string }

export default function CartPage() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [speed, setSpeed] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Confirm | null>(null);
  useEffect(() => { setLines(readCart()); const f = () => setLines(readCart()); window.addEventListener("afterglow-cart", f); return () => window.removeEventListener("afterglow-cart", f); }, []);

  const items = lines.map((l) => ({ ...l, item: BY_ID.get(l.id)! })).filter((l) => l.item);
  const total = items.reduce((s, l) => s + l.item.price_usd + (l.wrap ? WRAP : 0), 0) + (speed === "express" ? 9 : 0);
  const more = useMemo(() => (items.length ? completeTheGift(items.map((l) => l.id), 4).map((s) => BY_ID.get(s.id)!).filter(Boolean) : []), [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  async function placeOrder() {
    setBusy(true);
    const order = `AG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    let learned: Confirm["learned"] = null;
    let error: string | undefined;
    if (note.trim()) {
      try {
        const res = await fetch("/api/recommend", { method: "POST", headers: passHeaders(), body: JSON.stringify({ message: note.trim() }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "The agent could not read the note");
        if (data.gap && !data.paused) {
          recordDemand({ message: note.trim(), signals: (data.extraction?.signals ?? []).map((x: { name: string }) => x.name), wanted: data.gap.wanted });
          learned = { carried: data.gap.wanted.filter((w: { owned: boolean }) => w.owned).length, total: data.gap.wanted.length, missing: data.gap.wanted.filter((w: { owned: boolean }) => !w.owned).slice(0, 3).map((w: { name: string }) => w.name) };
        }
      } catch (e) { error = e instanceof Error ? e.message : String(e); }
    }
    writeCart([]);
    setDone({ order, total, learned, error });
    setBusy(false);
  }

  return (
    <main className="shop">
      <Header side="shopper" />
      <section className="band has-photo band-short">
        <img className="band-photo" src="/brand/hero-b.jpg" alt="" />
        <p className="lb-kicker">Checkout · demo, nothing is charged</p>
        <h1>Your bag</h1>
        <p className="lb-lede">{items.length ? `${items.length} title${items.length > 1 ? "s" : ""}, gift wrap included where you asked for it.` : "Nothing here yet."}</p>
      </section>
      <section className="blk blk-cream cart-blk">
      {items.length === 0 && !done && <p className="sub">Your bag is empty. <Link href="/" className="pill">Find something in the store</Link></p>}
      {items.length > 0 && (
        <div className="checkout">
          <section>
            <ul className="lines">
              {items.map((l) => (
                <li key={l.id}>
                  <Link href={`/item/${l.id}`}><img src={`/covers/${l.id}.jpg`} alt="" /></Link>
                  <div><Link href={`/item/${l.id}`}><strong>{l.item.title}</strong></Link><span>{l.item.category}{l.wrap ? " · gift wrapped (+$4)" : ""}</span></div>
                  <b>${l.item.price_usd}</b>
                  <button type="button" className="ghost" onClick={() => { removeFromCart(l.id); setLines(readCart()); }}>Remove</button>
                </li>
              ))}
            </ul>
            {more.length > 0 && (
              <div className="complete">
                <h2>Complete the gift</h2>
                <p className="fine">Closest titles to what is in your bag, by who loves them (Qloo).</p>
                <div className="mini-row">
                  {more.map((m) => (
                    <button key={m.id} type="button" onClick={() => { addToCart(m.id, true); setLines(readCart()); }}>
                      <img src={`/covers/${m.id}.jpg`} alt="" /><span>{m.title}</span><small>+ ${m.price_usd}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <aside className="pay">
            <label htmlFor="note">Who is it for? What are they into?</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="My dad, he plays Pink Floyd and reads le Carré" />
            <p className="fine">Optional. The assistant uses it to check our shelves for this taste; the shop owner only sees which titles were missing, never your note.</p>
            <label htmlFor="speed">Delivery</label>
            <select id="speed" value={speed} onChange={(e) => setSpeed(e.target.value)}>
              <option value="standard">Standard, 3-5 days (free)</option>
              <option value="express">Express, next day (+$9)</option>
            </select>
            <p className="total">Total <b>${total}</b></p>
            <button type="button" className="btn-big" disabled={busy} onClick={placeOrder}>{busy ? "Placing…" : "Place demo order"}</button>
            <p className="fine">Demo store: no payment details, nothing is charged.</p>
          </aside>
        </div>
      )}
      </section>
      {done && (
        <div className="modal-veil" role="dialog" aria-modal="true" aria-labelledby="done-title">
          <div className="modal">
            <p className="eyebrow">Order {done.order}</p>
            <h2 id="done-title">Thank you. It&apos;s on its way.</h2>
            <p>Demo order for ${done.total}. Nothing was charged.</p>
            {done.learned && (
              <p className="learned">
                Your note taught the store something: we carry <b>{done.learned.carried} of the {done.learned.total}</b> titles that taste loves most.
                {done.learned.missing.length > 0 && <> {done.learned.missing.join(", ")} and the rest are now on the owner&apos;s list to stock.</>}
              </p>
            )}
            {done.error && <p className="fine">The note could not be read this time ({done.error}).</p>}
            <div className="modal-actions"><Link href="/owner" className="btn-big">See what the owner sees</Link><Link href="/">Back to the store</Link></div>
          </div>
        </div>
      )}
    </main>
  );
}
