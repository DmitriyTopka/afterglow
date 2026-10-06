import { Header } from "@/app/components/Header";
import { CrateList, TasteMap } from "@/app/components/TasteMap";

export const metadata = { title: "Taste map · Afterglow" };

export default function TasteMapPage() {
  return (
    <main className="shop">
      <Header side="shopper" />
      <section className="store"><TasteMap /><CrateList /></section>
    </main>
  );
}
