// Print which Qloo entity each catalog item maps to (top /search hit), to spot wrong or missing matches.
import "./env.mts";
(async () => {
  const { search } = await import("../lib/qloo/client.ts");
  const { default: catalog } = await import("../data/catalog.json", { with: { type: "json" } });
  const log: any[] = [];
  for (const it of catalog.items) {
    const r: any = await search(it.qloo.name, it.qloo.type, log);
    const h = r.results ?? [];
    console.log(it.id, "|", it.qloo.name, "->", h.slice(0, 3).map((x: any) => `${x.name} [${(x.types ?? [x.subtype]).join("/")}]`).join(" ; ") || "NONE");
  }
  console.log("live calls:", log.filter((c) => c.cache === "miss").length);
})();
