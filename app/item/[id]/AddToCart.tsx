"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, readCart } from "@/lib/cart";

export function AddToCart({ id }: { id: string }) {
  const [wrap, setWrap] = useState(true);
  const [inCart, setInCart] = useState(false);
  useEffect(() => setInCart(readCart().some((l) => l.id === id)), [id]);
  if (inCart) return <p className="in-cart">In your bag. <Link href="/cart">Go to checkout</Link></p>;
  return (
    <div className="buy">
      <label className="wrap"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Gift wrap it</label>
      <button type="button" className="btn-big" onClick={() => { addToCart(id, wrap); setInCart(true); }}>Add to bag</button>
    </div>
  );
}
