// "How it works": the agent's real chain, in order. Claude Haiku decides which Qloo tool to call next; each step is
// one of its six tools, and the last one hands the owner what the shop didn't have.
const PARTS = [
  { k: "Find the tastes", t: "Claude turns the shopper's words into names Qloo knows (Qloo search). A genre or a mood becomes two or three works that stand for it." },
  { k: "Score the shelves", t: "One Qloo insights call scores all 384 titles for that taste, with the recipient's age and gender as signals, and says which taste drove each match." },
  { k: "Check the store", t: "Qloo lists the ten titles this taste loves most anywhere. The agent counts what the shop carries. Claude alone cannot know this." },
  { k: "Pick five", t: "Claude picks five across formats, within budget and age. Each pick carries a Qloo fact; a reason Qloo's tags don't support is rewritten from data." },
  { k: "Tell the owner", t: "Every title the shop didn't have joins the owner's restock list, with a record to order and a shelf on the store map." },
];

export function HowItWorks() {
  return (
    <section className="blk blk-ink how" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="how-grid how-steps">
        {PARTS.map((p) => (
          <li key={p.k} className="how-card"><h3>{p.k}</h3><p>{p.t}</p></li>
        ))}
      </ol>
      <dl className="facts">
        <div><dt>384</dt><dd>titles in the demo store, all resolved in Qloo</dd></div>
        <div><dt>36</dt><dd>reference tastes behind the map</dd></div>
        <div><dt>0</dt><dd>hand-written tags or customer records</dd></div>
        <div><dt>6</dt><dd>tools the agent chooses between (four call Qloo), at most 6 turns and 25 live Qloo calls a request</dd></div>
      </dl>
    </section>
  );
}
