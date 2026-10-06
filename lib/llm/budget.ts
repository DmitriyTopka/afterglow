// Per-instance daily spend ceiling for Claude calls. Not shared across serverless instances,
// so the real ceiling is cap x instances; the cache keeps repeat traffic off the model anyway.
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

let day = new Date().toISOString().slice(0, 10);
let spentUsd = 0;

function roll() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    spentUsd = 0;
  }
}

export function capUsd(): number {
  const cap = Number(process.env.LLM_DAILY_USD_CAP);
  return cap > 0 ? cap : 1; // an empty or broken value must not switch the live agent off

}

export function canSpend(): boolean {
  roll();
  return spentUsd < capUsd();
}

export function record(model: string, inputTokens: number, outputTokens: number): number {
  roll();
  const p = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK["claude-sonnet-5-5"];
  const usd = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  spentUsd += usd;
  return usd;
}

export function spent(): number {
  roll();
  return spentUsd;
}
