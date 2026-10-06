// Who shops each map section: Qloo demographics for the section's 5 core titles (9 calls), written into data/owner.json.
import "./env.mts";
import { readFileSync, writeFileSync } from "node:fs";
(async () => {
  const { audience } = await import("../lib/agent/audience.ts");
  const items = JSON.parse(readFileSync("data/catalog.json", "utf8")).items;
  const owner = JSON.parse(readFileSync("data/owner.json", "utf8"));
  const calls: any[] = [];
  for (const s of owner.sections) {
    const ids = s.signals.map((id: string) => items.find((i: any) => i.id === id)?.qloo.entity_id).filter(Boolean);
    const a = await audience(ids, calls);
    s.audience = a;
    console.log(s.name, "->", a?.summary);
  }
  writeFileSync("data/owner.json", JSON.stringify(owner, null, 1));
  console.log("live calls", calls.filter((c) => c.cache === "miss").length);
})();
