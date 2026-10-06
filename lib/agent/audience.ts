// Who loves these tastes? Qloo demographics insights: how fans skew by age band and gender (-1..1 per band).
import { insights, type QlooCall } from "@/lib/qloo/client";

export interface Audience { age: Record<string, number>; gender: Record<string, number>; summary: string }

const AGE_LABEL: Record<string, string> = { "24_and_younger": "under 25", "25_to_29": "25-29", "30_to_34": "30-34", "35_to_44": "35-44", "45_to_54": "45-54", "55_and_older": "55+" };

export async function audience(entityIds: string[], calls: QlooCall[]): Promise<Audience | null> {
  try {
    const res = await insights({ "filter.type": "urn:demographics", "signal.interests.entities": entityIds.join(",") }, calls);
    const rows = res.results.demographics ?? [];
    if (!rows.length) return null;
    const avg = (pick: (r: (typeof rows)[number]) => Record<string, number> | undefined) => {
      const out: Record<string, number> = {};
      for (const r of rows) for (const [k, v] of Object.entries(pick(r) ?? {})) out[k] = (out[k] ?? 0) + v / rows.length;
      return out;
    };
    const age = avg((r) => r.query.age), gender = avg((r) => r.query.gender);
    const topAge = Object.entries(age).sort((a, b) => b[1] - a[1])[0];
    const g = Object.entries(gender).sort((a, b) => b[1] - a[1])[0];
    const summary = `Fans skew ${AGE_LABEL[topAge?.[0]] ?? topAge?.[0] ?? "?"}` + (g && Math.abs(g[1]) >= 0.2 ? `, somewhat more ${g[0]}` : ", evenly split by gender");
    return { age, gender, summary };
  } catch {
    return null;
  }
}
