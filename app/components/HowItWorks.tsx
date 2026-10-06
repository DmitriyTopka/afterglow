// "How it works": what each part of the stack does, in the shop's words, plus the numbers behind the map.
const PARTS = [
  { k: "Qloo search", t: "Finds every title in the store and every taste a shopper names (an artist, a film, a game) as a Qloo entity." },
  { k: "Qloo insights", t: "Scores the whole catalog against a shopper's tastes and says which taste drove each match (explainability)." },
  { k: "Taste map", t: "Each title is scored against 36 reference tastes. Titles loved by the same people end up in the same section, across formats." },
  { k: "Claude Haiku", t: "Reads the shopper's own words and pulls out the tastes. About a tenth of a cent per request." },
];

export function HowItWorks() {
  return (
    <section className="blk blk-ink how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <div className="how-grid">
        {PARTS.map((p) => (
          <div key={p.k} className="how-card"><h3>{p.k}</h3><p>{p.t}</p></div>
        ))}
      </div>
      <dl className="facts">
        <div><dt>384</dt><dd>titles in the demo store, all resolved in Qloo</dd></div>
        <div><dt>36</dt><dd>reference tastes behind the map</dd></div>
        <div><dt>0</dt><dd>hand-written tags or customer records</dd></div>
        <div><dt>~30%</dt><dd>of 300 random Amazon listings Qloo recognises; culture goods far more (2 in 3 for music and film)</dd></div>
      </dl>
    </section>
  );
}
