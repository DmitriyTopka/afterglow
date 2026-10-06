// Resolve every name the rule-based extractor knows, to check signal -> Qloo entity mapping.
import "./env.mts";
(async () => {
  const { mockExtract } = await import("../lib/llm/extract.ts");
  const { resolveSignal } = await import("../lib/agent/score.ts");
  const KIND: any = { person: "urn:entity:person", artist: "urn:entity:artist", movie: "urn:entity:movie", book: "urn:entity:book", video_game: "urn:entity:videogame", brand: "urn:entity:brand" };
  const text = "nolan zimmer interstellar villeneuve ghibli miyazaki murakami christie miles davis daft punk radiohead wes anderson elden ring zelda tolkien kendrick patagonia blade runner";
  const calls: any[] = [];
  for (const s of mockExtract(text).signals) {
    const r = await resolveSignal(s.name, KIND[s.kind], calls);
    console.log(`${s.name} (${s.kind}) -> ${r ? `${r.name}${r.exact ? "" : "  [NOT EXACT]"}` : "NONE"}`);
  }
  console.log("live calls", calls.filter((c) => c.cache === "miss").length);
})();
