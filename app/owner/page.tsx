import { Header } from "@/app/components/Header";
import { OwnerView } from "./OwnerView";
import { HowItWorks } from "@/app/components/HowItWorks";

export const metadata = { title: "Owner view · Afterglow" };

export default function OwnerPage() {
  return (
    <main className="shop">
      <Header side="owner" />
      <section className="band has-photo">
        <img className="band-photo" src="/brand/hero-c.jpg" alt="" />
        <p className="lb-kicker">For the shop owner</p>
        <h1>Your store, mapped by taste.</h1>
        <p className="lb-lede">See what your shoppers came in for and could not find, let the restock agent plan the next order, and place a brand-new title on your shelves before anyone has bought it.</p>
        <p className="band-links"><a href="/real" className="pill">See it on a real record shop in Austin →</a></p>
      </section>
      <OwnerView />
      <HowItWorks />
    </main>
  );
}
