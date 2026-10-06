// Cold start at run time: score one new title against the 36 reference tastes and place it on the map.
import probes from "@/data/probes.json";
import { insights, type QlooCall } from "@/lib/qloo/client";
import type { QlooEntityType } from "@/lib/qloo/types";
import { place, type Placement } from "./place";

export async function coldStart(entityId: string, type: QlooEntityType, calls: QlooCall[]): Promise<Placement | null> {
  const aff: Array<number | null> = [];
  for (const p of probes as Array<{ entity_id: string | null }>) {
    if (!p.entity_id) { aff.push(null); continue; }
    try {
      const res = await insights({ "filter.type": type, "signal.interests.entities": p.entity_id, "filter.results.entities": entityId, take: "1" }, calls);
      aff.push(res.results.entities?.[0]?.query?.affinity ?? null);
    } catch {
      aff.push(null);
    }
  }
  return place(aff, type);
}
