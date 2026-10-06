import { Header } from "@/app/components/Header";
import { OwnerView } from "./OwnerView";
import { HowItWorks } from "@/app/components/HowItWorks";

export const metadata = { title: "Owner view · Afterglow" };

export default function OwnerPage() {
  return (
    <main className="shop">
      <Header side="owner" />
      <section className="hero compact">
        <h1>Your store, mapped by taste.</h1>
        <p className="lede">384 titles grouped by who loves them, from Qloo data. No hand tagging, no customer data. Pick a section to see who shops it and what to stock next.</p>
      </section>
      <OwnerView />
      <HowItWorks />
    </main>
  );
}
