import Link from "next/link";
import { BagLink } from "./BagLink";

// Top bar shared by both sides of the demo. The toggle is the only navigation.
export function Header({ side }: { side: "shopper" | "owner" }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">Afterglow</Link>
      <span className="store-note">Demo store · 384 records, films, books, games and shows</span>
      <BagLink />
      <nav className="toggle" aria-label="Switch side">
        {side === "shopper" ? <span className="on">Shopper</span> : <Link href="/">Shopper</Link>}
        {side === "owner" ? <span className="on">Owner</span> : <Link href="/owner">Owner</Link>}
      </nav>
    </header>
  );
}
