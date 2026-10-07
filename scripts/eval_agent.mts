// Eval v3 on the frozen 40 blind scenarios (eval/v2_scenarios.json):
//   agent:       the live tool-using agent (Claude Haiku + Qloo tools), its first 3 picks
//   claude-only: the same Claude model sees the whole catalog as text and picks 5 ids, no Qloo
//   pipeline:    the fixed pipeline (run.ts) that the agent replaced
// Odd scenarios were used to choose the ranking on 06.10, so results are also reported for even ones only.
import "./env.mts";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { runAgentic } = await import("../lib/agent/agentic.ts");
  const { runAgent } = await import("../lib/agent/run.ts");
  const { record } = await import("../lib/llm/budget.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  // Args: [scenarios file] [output file] [nopipe]; defaults reproduce eval v3 on the frozen 40.
  const { scenarios } = JSON.parse(readFileSync(process.argv[2] ?? "eval/v2_scenarios.json", "utf8"));
  const OUT = process.argv[3] ?? "eval/v3_runs.json";
  const withPipeline = process.argv[4] !== "nopipe";
  const runs: Record<string, any> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const client = new Anthropic();
  const catalogText = items.map((i: any) => `${i.id} | ${i.title} | ${i.category} | $${i.price_usd}`).join("\n");
  const Picks = z.object({ ids: z.array(z.string()).describe("5 catalog ids, best first") });
  let usd = 0;
  for (const s of scenarios) {
    runs[s.id] ??= {};
    const r = runs[s.id];
    if (!r.agent) {
      const a = await runAgentic(s.message);
      usd += a.usd;
      r.agent = { ids: a.picks.map((p: any) => p.item.id), question: a.question ?? null, turns: a.turns, qloo: a.calls.filter((c: any) => c.cache === "miss").length, llm: a.modes.llm };
    }
    if (!r.claude) {
      const res = await client.messages.parse({
        model: "claude-haiku-4-5", max_tokens: 400,
        system: "You are a shop assistant at a culture store. Pick the 5 best titles for the shopper from the catalog, best first. Use only ids from the catalog. Respect any budget (price per item).",
        messages: [{ role: "user", content: `Catalog (id | title | format | price):\n${catalogText}\n\nShopper: ${s.message}` }],
        output_config: { format: zodOutputFormat(Picks) },
      });
      usd += record("claude-haiku-4-5", res.usage.input_tokens, res.usage.output_tokens);
      r.claude = { ids: (res.parsed_output?.ids ?? []).filter((id) => items.some((i: any) => i.id === id)) };
    }
    if (withPipeline && !r.pipeline) { const p = await runAgent(s.message); usd += p.usd; r.pipeline = { ids: p.picks.map((x: any) => x.item.id) }; }
    writeFileSync(OUT, JSON.stringify(runs, null, 1));
    console.log(`${s.id} agent ${r.agent.ids.slice(0, 3).join(",") || "Q:" + r.agent.question?.slice(0, 30)} | claude ${r.claude.ids.slice(0, 3).join(",")} | pipeline ${r.pipeline?.ids.slice(0, 3).join(",") ?? "-"}`);
  }
  console.log(`spent this run: $${usd.toFixed(3)}`);
})();
