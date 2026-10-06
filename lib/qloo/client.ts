// The only module that talks to Qloo. QLOO_MODE=mock|live switches the transport; callers never know.
import { cached } from "@/lib/cache";
import { mockInsights, mockSearch } from "./mock";
import type { InsightsParams, QlooInsightsResponse, QlooSearchResponse } from "./types";

export const QLOO_MODE = process.env.QLOO_MODE === "live" ? "live" : "mock";
const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

export interface QlooCall {
  endpoint: string;
  params: Record<string, string>;
  cache: "hit" | "miss";
  mode: "mock" | "live";
  ms: number;
}

// The hackathon key allows 5 requests per second and 10,000 per month (x-second-ratelimit-limit and
// x-month-ratelimit-limit headers), and one request can fan out into dozens of catalog lookups.
// Start at most one call every MIN_GAP_MS, keep MAX_IN_FLIGHT open, and retry 429s with backoff.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_IN_FLIGHT = 3;
const MIN_GAP_MS = 250;
const MAX_TRIES = 5;
let inFlight = 0;
let nextStart = 0;
const waiting: Array<() => void> = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  const now = Date.now();
  const startAt = Math.max(now, nextStart);
  nextStart = startAt + MIN_GAP_MS;
  if (startAt > now) await sleep(startAt - now);
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

async function get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_MODE=live but QLOO_API_KEY is not set");
  const url = `${BASE}${endpoint}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await slot(() => fetch(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(15000) }));
    if (res.status === 429 && attempt < MAX_TRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1));
      continue;
    }
    if (!res.ok) throw new Error(`Qloo ${endpoint} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
}

async function call<T>(endpoint: string, params: Record<string, string>, mock: () => T, log: QlooCall[]): Promise<T> {
  const t0 = Date.now();
  const { value, hit } = await cached(`qloo-${QLOO_MODE}`, { endpoint, params }, async () =>
    QLOO_MODE === "live" ? get<T>(endpoint, params) : mock(),
  );
  log.push({ endpoint, params, cache: hit ? "hit" : "miss", mode: QLOO_MODE, ms: Date.now() - t0 });
  return value;
}

export function search(query: string, types: string | undefined, log: QlooCall[]): Promise<QlooSearchResponse> {
  const params: Record<string, string> = { query, take: "3" };
  if (types) params.types = types;
  return call("/search", params, () => mockSearch(query, types), log);
}

export function insights(p: InsightsParams, log: QlooCall[]): Promise<QlooInsightsResponse> {
  const params = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Record<string, string>;
  return call("/v2/insights", params, () => mockInsights(p), log);
}
