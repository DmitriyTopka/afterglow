# Afterglow

**Your shop sees what sold. Afterglow sees what walked out.** A shopper describes someone's taste in their own words. A Claude agent, working through Qloo, picks across the whole store (vinyl, books, films, games, TV) and checks what that taste loves most that the store does not carry. That unmet demand lands on the owner's side, where the agent ranks what to stock next and places any new title on the store's taste map from Qloo data alone.

Video (65 s): https://youtu.be/tgxQNG9GPx4
Live demo: https://taste-layer-alpha.vercel.app (shopper), [/live](https://taste-layer-alpha.vercel.app/live) (both sides at once) and [/owner](https://taste-layer-alpha.vercel.app/owner) (owner).
Real shop: [/real](https://taste-layer-alpha.vercel.app/real) runs the public best-seller catalog of Waterloo Records (Austin, TX; no affiliation) through Qloo (`scripts/real_shelf.mts`, `data/real/waterloo.json`).
Project write-up: [docs/DEVPOST.md](docs/DEVPOST.md).
Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Built 4-30 October 2026.

## What the agent does

The shopper's message goes to Claude (Haiku 4.5) with six tools. Claude decides the order; a typical run:

| Tool | Qloo call | What it gives the agent |
|---|---|---|
| `find_tastes` | `GET /search` | the artists, films, books, games, people the shopper named, as Qloo entities |
| `score_catalog` (once) | `GET /v2/insights` with `filter.results.entities` (our 384 titles) and `feature.explainability` | affinity of every store title for this taste, and which named taste drove each match |
| `check_store` | `GET /v2/insights` without a catalog filter | the 10 titles this taste loves most anywhere; the ones we do not carry become demand for the owner |
| `audience` | `GET /v2/insights` with `filter.type=urn:demographics` | how fans of these tastes skew by age and gender |
| `ask_shopper` | none | one question back when the message has nothing to work with |
| `recommend` | none | 5 titles from the scored candidates, each with a reason in plain words |

Caps per request: 6 model turns and 25 live Qloo calls. Without an Anthropic key the same steps run as a fixed pipeline.

## The owner side

A second agent (Claude Haiku) plans the restock. Its tools: `coverage_report` (unmet demand and coverage gain per missing title), `sections` (map sections and who shops them), `audience` (Qloo demographics for a candidate), `place_on_map` (cold start, at most one live per plan) and `plan` (3 titles with reasons and the coverage they reach).

- **Taste map.** Every title is scored against 36 reference tastes (Qloo insights). Titles loved by the same people form sections across formats, for example arthouse films next to late-night jazz.
- **Taste coverage.** Share of the titles shoppers' tastes love most that are on the shelves. Starts at 18.4% for the 38 demo shoppers: 81.6% of what their tastes love is not on the shelves.
- **Check your own shop.** Paste up to 30 titles you stock; Qloo resolves each and the same demand is measured against your shelf.
- **Stock suggestions.** Missing titles ranked by how much coverage they add.
- **Add to shelf (cold start).** A new title with no sales and no tags is scored against the 36 reference tastes and lands next to its closest titles on the map, for example Judas Priest next to Iron Maiden and Megadeth.

## How well it works (measured, not tuned on the test)

- 40 shopper requests written and labelled by a blind agent that only saw the catalog (`eval/v2_scenarios.json`). Ranking changes were chosen on the odd-numbered requests; the even ones were never used for tuning.
- Against Claude alone reading the whole catalog as text (same model, no Qloo), on the 20 untuned requests: labels P@3 0.52 vs 0.37, pooled 0.63 vs 0.55, 11 wins and 4 losses on labels (`eval/REPORT_v5_2026-10-06.md`). The first agent version only tied on that half (`eval/REPORT_v3_2026-10-06.md`).
- Claude alone put 12 over-budget titles in its top three across the 40 requests; the agent none.
- Qloo recognises about 30% of 300 random Amazon listings, and about 2 in 3 for music and film. That is why the demo store sells culture goods.
- An earlier test on a hand-tagged toy catalog went the other way (hand tags beat Qloo). Details in `eval/REPORT_2026-10-06.md` and `eval/REPORT_v2_2026-10-06.md`.

## Honest limits

- If the Qloo hackathon key stops working (or `QLOO_OFFLINE=1`), the site says so; examples, the live-screen replays, product pages and the owner view keep working from recorded Qloo data.
- Artwork in `public/brand/` was generated with Higgsfield for this project.

- The store, its prices and the demo shoppers are made up. Demo demand comes from 38 test shoppers; your own requests are added in your browser (localStorage).
- Cover art for the 384 demo titles is included as small thumbnails (`public/covers`, 240px; `public/covers-lg`, up to 640px WebP; `public/brand/atlas.webp`, one sheet for the store map) so the demo runs as is. The images come from the iTunes Search API and Qloo entity data and belong to their rights holders; they are here only to illustrate the demo store. `scripts/make_thumbs.py` and `scripts/make_large_covers.py` rebuild them from `data/catalog.json`.

## Run locally

```sh
npm install
cp .env.example .env.local   # add a Qloo hackathon key and an Anthropic key; without them mock mode returns canned data, so picks differ from the live site
npm run dev                  # open http://localhost:3000
```

Data pipeline (all cached under `.cache/`): `scripts/discover_candidates.mts` -> `build_catalog.py` -> `build_baseline.mts` -> `taste_probes.mts` -> `build_map.py` -> `name_clusters.mts` -> `build_owner.mts` -> `build_probes.mts` -> `build_cycle.mts`.

## License

MIT
