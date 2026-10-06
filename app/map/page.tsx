import { Header } from "@/app/components/Header";
import { CrateList, TasteMap } from "@/app/components/TasteMap";
import map from "@/data/taste_map.json";

export const metadata = { title: "Taste map · Afterglow" };

export default function TasteMapPage() {
  return (
    <main className="shop">
      <Header side="shopper" />
      <section className="band band-short">
        <p className="lb-kicker">The whole store</p>
        <h1>Placed by who loves it.</h1>
        <p className="lb-lede">{Object.keys(map.items).length} titles with Qloo taste data, grouped by the people who love them (Qloo taste data), not by format. Click a section to step into it.</p>
      </section>
      <section className="blk blk-ink"><TasteMap /><CrateList /></section>
    </main>
  );
}
