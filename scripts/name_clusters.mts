// Name the taste-map clusters with Claude Haiku (one call). Writes name + one-line description into data/taste_map.json.
import "./env.mts";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const P = "data/taste_map.json";
  const map = JSON.parse(readFileSync(P, "utf8"));
  const brief = map.clusters.map((c: any) => `#${c.id} (${c.size} items; ${Object.entries(c.categories).map(([k, v]) => `${v} ${k}`).join(", ")})\nExamples: ${c.examples.join(" | ")}\nTags: ${c.top_tags.join(", ")}`).join("\n\n");
  const Out = z.object({ clusters: z.array(z.object({ id: z.number(), name: z.string().describe("2-4 words, evocative, like a record-store section sign"), line: z.string().describe("One plain sentence on the shared taste, max 14 words") })) });
  const res = await new Anthropic().messages.parse({
    model: "claude-haiku-4-5", max_tokens: 2000,
    system: "You name sections of a culture store (vinyl, books, film, games, TV) grouped by shared audience taste. Names must describe the taste, not list categories. No em dashes.",
    messages: [{ role: "user", content: brief }],
    output_config: { format: zodOutputFormat(Out) },
  });
  for (const n of res.parsed_output!.clusters) Object.assign(map.clusters.find((c: any) => c.id === n.id), { name: n.name, line: n.line });
  writeFileSync(P, JSON.stringify(map, null, 1));
  for (const c of map.clusters) console.log(`#${c.id} ${c.name}: ${c.line}`);
  console.log("usd", ((res.usage.input_tokens + res.usage.output_tokens * 5) / 1e6).toFixed(4));
})();
