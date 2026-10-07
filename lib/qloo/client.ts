// The only module that talks to Qloo. QLOO_MODE=mock|live switches the transport; callers never know.
import { cached } from "@/lib/cache";
import { lane } from "@/lib/access";
import { mockInsights, mockSearch } from "./mock";
import type { InsightsParams, QlooInsightsResponse, QlooSearchResponse } from "./types";

export const QLOO_MODE = process.env.QLOO_MODE === "live" ? "live" : "mock";

/** Live Qloo access is gone (key revoked or expired, or switched off with QLOO_OFFLINE=1). Recorded answers still work. */
export class QlooUnavailable extends Error {}
export const QLOO_OFFLINE = process.env.QLOO_OFFLINE === "1";
export const OFFLINE_MESSAGE =
  "Live Qloo access is paused right now (the hackathon API key may have expired). The four examples, the live screen replays, product pages and the owner view still work from recorded Qloo data.";
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

// Monthly quota reserve: once Qloo reports fewer calls left this month than the reserve, stop live calls and serve
// recorded data, so the demo still works when judges arrive. Read from every response, so it holds on every instance.
// Anonymous traffic stops early (3500 left); a request with the judges' pass may go down to 1000. A bot can then burn
// at most the anonymous share, and judges keep about 2500 calls (some 160 live requests) until the monthly reset.
const RESERVE = Number(process.env.QLOO_MONTH_RESERVE ?? 1000);
const PUBLIC_RESERVE = Number(process.env.QLOO_PUBLIC_RESERVE ?? 3500);
const reserve = () => (lane.getStore()?.judge ? RESERVE : Math.max(RESERVE, PUBLIC_RESERVE));
let monthRemaining: number | null = null;
let monthResetAt = 0; // ms timestamp when Qloo says the monthly quota resets; after it the reserve no longer applies
export const QUOTA_MESSAGE = "Live Qloo calls are paused to keep this month's quota for the judging period. The examples, the live screen replays, product pages and the owner view still work from recorded Qloo data.";

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
  if (QLOO_OFFLINE) throw new QlooUnavailable(OFFLINE_MESSAGE);
  if (!key) throw new Error("QLOO_MODE=live but QLOO_API_KEY is not set");
  if (monthRemaining !== null && Date.now() >= monthResetAt) monthRemaining = null; // quota has reset: try live again
  if (monthRemaining !== null && monthRemaining < reserve()) throw new QlooUnavailable(QUOTA_MESSAGE);
  const url = `${BASE}${endpoint}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await slot(() => fetch(url, { headers: { "X-Api-Key": key }, signal: AbortSignal.timeout(15000) }));
    const left = Number(res.headers.get("x-month-ratelimit-remaining"));
    if (Number.isFinite(left) && res.headers.has("x-month-ratelimit-remaining")) {
      monthRemaining = left;
      const resetIn = Number(res.headers.get("x-month-ratelimit-reset")); // seconds until the monthly reset
      monthResetAt = Date.now() + (Number.isFinite(resetIn) && resetIn > 0 ? resetIn * 1000 : 6 * 3600 * 1000);
    }
    if (res.status === 429 && attempt < MAX_TRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new QlooUnavailable(OFFLINE_MESSAGE);
    if (res.status === 429) throw new QlooUnavailable("Qloo's rate limit for this demo is reached for now. The examples still work; try again later.");
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
