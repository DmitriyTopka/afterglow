// One-off: the minimum age each catalog title suits, from its official rating where one exists (MPAA/TV for film and TV,
// ESRB/PEGI for games, the publisher's reader age for books, explicit-lyrics labels for records). Stored as age_min in
// data/catalog.json so the agent never suggests an R-rated film to a 6-year-old. Claude Haiku, about $0.05 once.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
(async () => {
  const cat = JSON.parse(readFileSync("data/catalog.json", "utf8"));
  const client = new Anthropic();
  const todo = cat.items.filter((i: any) => typeof i.age_min !== "number");
  for (let k = 0; k < todo.length; k += 40) {
    const chunk = todo.slice(k, k + 40);
    const list = chunk.map((i: any) => `${i.id} | ${i.category} | ${i.title} | ${i.year ?? ""} | ${(i.tags ?? []).slice(0, 6).join(", ")}`).join("\n");
    const res = await client.messages.create({
      model: "claude-haiku-4-5", max_tokens: 2000,
      system: "You rate media for a gift shop. For each title give the minimum recipient age it suits, using its official rating when one exists: MPAA/US TV (G=0, PG=7, PG-13=13, R/TV-MA=17), ESRB (E=0, E10+=10, T=13, M=17), the publisher's reader age for books (picture/early readers 0, middle grade 8, young adult 13, adult 16), records 0 unless known for explicit lyrics (then 17). Answer only JSON: {\"id\": age, ...}.",
      messages: [{ role: "user", content: list }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const ages = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, number>;
    for (const i of chunk) if (typeof ages[i.id] === "number") i.age_min = ages[i.id];
    console.log(`${k + chunk.length}/${todo.length}`, res.usage.input_tokens, res.usage.output_tokens);
  }
  writeFileSync("data/catalog.json", JSON.stringify(cat, null, 1));
  const missing = cat.items.filter((i: any) => typeof i.age_min !== "number").length;
  console.log("missing", missing);
})();
