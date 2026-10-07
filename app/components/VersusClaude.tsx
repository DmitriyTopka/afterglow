// Same request, Claude alone: the recorded answer of the same model with the whole catalog as text and no Qloo
// (the eval's "Claude alone" arm, scripts/claude_alone_examples.mts), next to the agent's. Only facts both sides can
// be checked on: formats, budget, a title the shopper already named, a Qloo fact per pick, a store check for the owner.
type Item = { id: string; title: string; category: string; price_usd: number };

const work = (title: string) => title.replace(/,\s*LP$/, "").split(": ").slice(-1)[0].toLowerCase();

function facts(items: Item[], opts: { budget: number | null; named: string[]; qlooFacts: boolean; missing: number | null }) {
  const formats = new Set(items.map((i) => i.category)).size;
  const over = opts.budget ? items.filter((i) => i.price_usd > opts.budget!).length : null;
  const repeats = items.filter((i) => opts.named.some((n) => work(i.title).startsWith(n.toLowerCase()))).length;
  return [
    `${formats} format${formats === 1 ? "" : "s"}`,
    ...(over !== null ? [`${over} over the $${opts.budget} budget`] : []),
    `${repeats} title${repeats === 1 ? "" : "s"} the shopper already named`,
    opts.qlooFacts ? "a Qloo fact on every pick" : "no data behind the picks",
    opts.missing !== null ? `${opts.missing} missing titles sent to the owner` : "nothing for the owner",
  ];
}

export function VersusClaude({ request, agent, claude, named, missing }: { request: string; agent: Item[]; claude: Item[]; named: string[]; missing: number | null }) {
  const m = request.match(/\$\s?(\d{1,4})/);
  const budget = m ? Number(m[1]) : null;
  const side = (label: string, sub: string, items: Item[], f: string[], ours: boolean) => (
    <div className={`vs-side${ours ? " ours" : ""}`}>
      <h3>{label}</h3>
      <small>{sub}</small>
      <div className="vs-covers">{items.map((i) => <img key={i.id} src={`/covers/${i.id}.jpg`} alt={i.title} title={`${i.title} · $${i.price_usd}`} />)}</div>
      <ul>{f.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
  return (
    <section className="vs-claude" aria-label="Same request, Claude alone">
      <h2>Same request, Claude alone</h2>
      <p>The same Claude model, given the whole catalog as text and no Qloo. Recorded once, like the run above.</p>
      <div className="vs-grid">
        {side("Afterglow agent", "Claude with Qloo tools", agent, facts(agent, { budget, named, qlooFacts: true, missing }), true)}
        {side("Claude alone", "Same model, catalog as text", claude, facts(claude, { budget, named, qlooFacts: false, missing: null }), false)}
      </div>
    </section>
  );
}
