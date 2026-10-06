// Wire types for the parts of the Qloo API we use.
// Source: docs.qloo.com (Insights API Deep Dive, Search, Recommendation Insights), read 2026-10-04.
// Fields marked UNVERIFIED are inferred from prose in the docs, not from a live response.

export type QlooEntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:videogame"
  | "urn:demographics"
  | "urn:tag";

export interface QlooTag {
  id: string;
  name: string;
  type: string;
}

export interface QlooEntity {
  name: string;
  entity_id: string;
  type?: string; // "urn:entity"
  subtype?: string; // e.g. "urn:entity:movie"
  types?: string[]; // search results list types here
  popularity?: number;
  tags?: QlooTag[];
  properties?: Record<string, unknown>;
  query?: {
    affinity?: number; // UNVERIFIED location of the affinity score
    measurements?: Record<string, number>;
    // UNVERIFIED shape: docs say "which input entities contributed, normalized 0..1"
    explainability?: Record<string, Array<{ entity_id: string; score: number }>>;
  };
}

export interface QlooInsightsResponse {
  success: boolean;
  results: {
    entities?: QlooEntity[];
    tags?: unknown[];
    // filter.type=urn:demographics: per signal entity, how its fans skew by age band and gender (-1..1)
    demographics?: Array<{ entity_id: string; query: { age?: Record<string, number>; gender?: Record<string, number> } }>;
  };
  duration?: number;
  _mock?: true;
}

export interface QlooSearchResponse {
  results: QlooEntity[];
  _mock?: true;
}

export interface InsightsParams {
  "filter.type": QlooEntityType;
  "signal.interests.entities"?: string;
  "filter.results.entities"?: string;
  "feature.explainability"?: "true";
  take?: string;
}

/** Affinity lives in different places depending on the request; read it defensively. */
export function readAffinity(e: QlooEntity): number | null {
  if (typeof e.query?.affinity === "number") return e.query.affinity;
  return null;
}

/** Per-signal contribution (0..1) for one recommended entity, if Qloo returned it. */
export function readContributions(e: QlooEntity): Array<{ entity_id: string; score: number }> {
  const ex = e.query?.explainability;
  if (!ex) return [];
  return Object.values(ex).flat().filter((x) => x && typeof x.score === "number");
}
