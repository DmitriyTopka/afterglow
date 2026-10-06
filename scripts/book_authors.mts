// Ask Claude Haiku for the author of each catalog book in one call; "unknown" when not sure. Compared with Open Library.
import "./env.mts";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const P = "data/catalog_build/catalog_v2.json";
  const d = JSON.parse(readFileSync(P, "utf8"));
  const books = d.items.filter((i: any) => i.qloo.type.endsWith("book"));
  const list = books.map((b: any) => `${b.id} | ${b.works[0]} | ${b.year || "?"}`).join("\n");
  const Out = z.object({ books: z.array(z.object({ id: z.string(), author: z.string().describe("Primary author's usual name, or 'unknown'") })) });
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: "claude-haiku-4-5", max_tokens: 4000,
    system: "You identify the primary author of well-known books. If a line names two books or you are not confident, answer 'unknown'. Never guess.",
    messages: [{ role: "user", content: `For each line (id | title | year) give the primary author.\n${list}` }],
    output_config: { format: zodOutputFormat(Out) },
  });
  const usd = (res.usage.input_tokens * 1 + res.usage.output_tokens * 5) / 1e6;
  const byId = new Map(res.parsed_output!.books.map((b) => [b.id, b.author]));
  let agree = 0, changed = 0, filled = 0, unknown = 0;
  for (const b of books) {
    const h = byId.get(b.id) ?? "unknown"; const ol = b.creators[0];
    if (h === "unknown") { unknown++; if (!ol) b.title = b.works[0]; continue; }
    if (ol && ol.toLowerCase() === h.toLowerCase()) { agree++; continue; }
    if (ol) { changed++; console.log(`  ${b.id} ${b.works[0].slice(0, 40)}: OL "${ol}" -> Haiku "${h}"`); } else filled++;
    b.creators = [h]; b.title = `${h}: ${b.works[0]}`;
  }
  writeFileSync(P, JSON.stringify(d, null, 1));
  console.log({ agree, changed, filled, unknown, usd: usd.toFixed(4) });
})();
