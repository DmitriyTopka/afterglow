// The comparison on the one-click examples: what the same Claude model picks with the whole catalog as text and no
// Qloo (the "Claude alone" arm of the eval, same prompt as scripts/eval_agent.mts). Stored next to each recorded run
// in data/saved_answers.json as claudeAlone, so the example screens can show both answers side by side.
import "./env.mts";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const saved = JSON.parse(readFileSync("data/saved_answers.json", "utf8"));
  const client = new Anthropic();
  const catalogText = items.map((i: any) => `${i.id} | ${i.title} | ${i.category} | $${i.price_usd}`).join("\n");
  const Picks = z.object({ ids: z.array(z.string()).describe("5 catalog ids, best first") });
  for (const [text, run] of Object.entries<any>(saved)) {
    const res = await client.messages.parse({
      model: "claude-haiku-4-5", max_tokens: 400,
      system: "You are a shop assistant at a culture store. Pick the 5 best titles for the shopper from the catalog, best first. Use only ids from the catalog. Respect any budget (price per item).",
      messages: [{ role: "user", content: `Catalog (id | title | format | price):\n${catalogText}\n\nShopper: ${text}` }],
      output_config: { format: zodOutputFormat(Picks) },
    });
    const ids = (res.parsed_output?.ids ?? []).filter((id) => items.some((i: any) => i.id === id)).slice(0, 5);
    run.claudeAlone = { items: ids.map((id) => { const i = items.find((x: any) => x.id === id); return { id, title: i.title, category: i.category, price_usd: i.price_usd }; }), model: "claude-haiku-4-5", note: "Same model, the whole catalog as text, no Qloo." };
    const t = (id: string) => items.find((i: any) => i.id === id);
    console.log("==", text.slice(0, 50)); for (const id of ids) console.log("   claude:", t(id).category, "$" + t(id).price_usd, t(id).title.slice(0, 50));
    console.log("   agent :", run.picks.map((p: any) => p.item.title.slice(0, 22)).join(" | "));
  }
  writeFileSync("data/saved_answers.json", JSON.stringify(saved, null, 1));
})();
