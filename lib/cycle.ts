// The loop, client side. Demand = the 38 demo shoppers (data/cycle.json) plus requests made in this browser.
// Shelf = the catalog plus titles the owner added here. Kept in localStorage: per viewer, survives reloads.
import cycle from "@/data/cycle.json";

export interface WantedTitle { entity_id: string; name: string; type: string; image: string | null; affinity: number | null; owned: boolean }
export interface DemandRow { id: string; source: "demo" | "you"; message: string; signals: string[]; wanted: WantedTitle[] }
export interface Placement { cluster: number; clusterName: string; similarity: number; neighbours: Array<{ id: string; similarity: number }>; x: number; y: number }
export interface Added { entity_id: string; name: string; type: string; image: string | null; placement: Placement }

const KD = "afterglow.demand.v1";
const KA = "afterglow.added.v1";
const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: loop still works for this page view */ } };

export const seedDemand = cycle.demand as DemandRow[];
export const myDemand = (): DemandRow[] => read<DemandRow[]>(KD, []);
export const addedTitles = (): Added[] => read<Added[]>(KA, []);

export function recordDemand(row: Omit<DemandRow, "id" | "source">) {
  const rows = myDemand();
  if (rows.some((r) => r.message === row.message)) return;
  write(KD, [...rows, { ...row, id: `you-${Date.now()}`, source: "you" }].slice(-30));
}
export function addTitle(a: Added) { write(KA, [...addedTitles().filter((x) => x.entity_id !== a.entity_id), a]); }
export function resetLoop() { write(KD, []); write(KA, []); }

/** Share of each request's top-10 wanted titles that are on the shelf, averaged over requests. */
/** One format for coverage on every screen: one decimal, so a single stocked title visibly moves it. */
export const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function coverage(rows: DemandRow[], added: Set<string>): number {
  const real = rows.filter((r) => r.wanted.length > 0); // an empty row would divide by zero
  if (!real.length) return 0;
  return real.reduce((s, r) => s + r.wanted.filter((w) => w.owned || added.has(w.entity_id)).length / r.wanted.length, 0) / real.length;
}

/** Missing titles ranked by how much coverage the store gains by stocking them (the agent's suggestion). */
export function suggestions(rows: DemandRow[], added: Set<string>) {
  const m = new Map<string, WantedTitle & { askedBy: number; gain: number; yours: boolean }>();
  for (const r of rows) for (const w of r.wanted) {
    if (w.owned || added.has(w.entity_id)) continue;
    const s = m.get(w.entity_id) ?? { ...w, askedBy: 0, gain: 0, yours: false };
    s.askedBy++; s.gain += 1 / r.wanted.length / rows.length; s.yours ||= r.source === "you";
    m.set(w.entity_id, s);
  }
  return [...m.values()].sort((a, b) => Number(b.yours) - Number(a.yours) || b.gain - a.gain || (b.affinity ?? 0) - (a.affinity ?? 0));
}
