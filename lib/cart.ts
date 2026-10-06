// Demo cart in localStorage. Nothing is charged; checkout only records the order locally.
export interface CartLine { id: string; wrap: boolean }
const K = "afterglow.cart.v1";
export function readCart(): CartLine[] { try { return JSON.parse(localStorage.getItem(K) ?? "[]") as CartLine[]; } catch { return []; } }
export function writeCart(lines: CartLine[]) {
  try { localStorage.setItem(K, JSON.stringify(lines)); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("afterglow-cart")); } catch { /* server */ }
}
export function addToCart(id: string, wrap = false) { const c = readCart(); if (!c.some((l) => l.id === id)) writeCart([...c, { id, wrap }]); }
export function removeFromCart(id: string) { writeCart(readCart().filter((l) => l.id !== id)); }
