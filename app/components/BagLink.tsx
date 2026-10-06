"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readCart } from "@/lib/cart";

export function BagLink() {
  const [n, setN] = useState(0);
  useEffect(() => { const f = () => setN(readCart().length); f(); window.addEventListener("afterglow-cart", f); window.addEventListener("storage", f); return () => { window.removeEventListener("afterglow-cart", f); window.removeEventListener("storage", f); }; }, []);
  return <Link href="/cart" className="bag">Bag{n ? ` (${n})` : ""}</Link>;
}
