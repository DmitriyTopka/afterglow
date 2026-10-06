# Afterglow: a culture store that learns from what its shoppers could not find

Tagline (Devpost, max 200 chars): Two Claude agents on Qloo: one picks gifts across vinyl, books, film and games; the other turns every request the shop could not serve into a restock plan.

Live demo: https://taste-layer-alpha.vercel.app (start with "Watch the shopper and the owner side by side")
Code: https://github.com/DmitriyTopka/afterglow (MIT)

## Inspiration

Independent record shops and bookstores lose to big platforms on data. A chain sees every click; a small shop sees only what sold. It never learns what someone came in for and left without. We wanted a shop assistant that remembers that part, and an owner's view that turns it into the next order.

## What it does

Afterglow is a demo culture store with 384 real titles (vinyl, books, films, games, TV box sets), fictional prices, and two agents.

**The shop assistant.** You write the way you would talk to a clerk: "He's into Joy Division and rereads Murakami every winter." Claude Haiku works through Qloo with six tools and decides the order: find the tastes, score the whole catalog once, check what the store is missing, look up who the fans are, ask a question when there is nothing to go on, recommend. It answers with five titles across formats, each with a plain reason, for example The Cure's Disintegration, Eternal Sunshine of the Spotless Mind and Shadow of the Colossus for that request.

**The store check.** On every request the agent asks Qloo for the ten titles that taste loves most anywhere, and counts how many the shop carries. For the Joy Division request the answer is 3 of 10; The Smiths, Gang of Four and Echo & the Bunnymen go to the owner as unmet demand.

**The owner's agent.** The owner sees one number: taste coverage, the share of what shoppers' tastes love that is on the shelves (18.4% for the 38 demo shoppers). A second Claude agent reads the gaps, checks who loves each candidate with Qloo demographics, and proposes three titles to stock with the coverage they would reach. "Add to shelf" scores the new title against 36 reference tastes and places it on the store's taste map next to its closest titles: Judas Priest lands beside Iron Maiden and Megadeth. No sales history, no tags.

**The taste map.** The shop is laid out by who loves each title, not by format. Arthouse films sit next to late-night jazz records; classic rock sits next to the games its fans play. Nine sections, each with its audience from Qloo demographics.

**The full path.** Product pages, a bag with "complete the gift" suggestions, and a demo checkout. The checkout asks "Who is it for? What are they into?", and the confirmation shows what that order taught the store.

## How we built it

Next.js on Vercel, Claude Haiku 4.5 with tool use, and these Qloo calls:

| What | Qloo endpoint |
|---|---|
| Find what the shopper named | `GET /search` (exact name match first, typed search second) |
| Score all 384 titles for a taste | `GET /v2/insights` with `filter.results.entities` and `feature.explainability` |
| Store check: what this taste loves most | `GET /v2/insights` without a catalog filter, per format |
| Who loves it | `GET /v2/insights` with `filter.type=urn:demographics` |
| Taste map and cold start | `GET /v2/insights` against 36 reference tastes, one call each |
| Build the catalog | `GET /v2/insights` over 20 seed tastes; covers from Qloo entity images and the iTunes Search API |

The map uses each title's affinity for the 36 reference tastes, centred per format and clustered (k-means, 9 sections). A new title gets the same 36 scores and joins the section of its five nearest titles. Caps per request: 6 model turns, 25 live Qloo calls; one live cold start per owner plan.

## How we measured it

A separate blind agent, which saw only the catalog, wrote and labelled 40 shopper requests before we tuned anything. A second blind agent judged every pick the labels did not cover.

- Without hand-made tags, Qloo beats the store's own metadata (titles by or of a named taste) on 10 requests and loses 2. When the named taste is not in stock, metadata finds almost nothing (P@3 0.02); Qloo finds 0.15.
- We chose ranking changes on the odd-numbered requests and checked them once on the even ones: P@3 went from 0.17 to 0.38.
- Against Claude alone reading the whole catalog as text: over all 40 requests the agent wins 21 and loses 10 (P@3 0.56 vs 0.43). On the 20 requests we never tuned on, it is a tie (0.50 vs 0.55). Claude alone put 12 over-budget titles in its top three; the agent put none.
- An earlier test on a small hand-tagged catalog went the other way: hand tags beat Qloo. That result is in the repo too.

Our honest reading: the agent picks as well as a strong model that can read the whole catalog, keeps to budgets, explains each pick, and produces demand data that a prompt alone does not. A real shop with 50,000 titles will not fit in a prompt; Qloo scoring does not care.

## Challenges

- Qloo never returns the signal itself, so a shop built from Qloo's suggestions was missing Taylor Swift and Miles Davis. We added the seeds back.
- Raw affinity follows popularity: LEGO topped every early list. Lift against reference tastes and per-format percentiles fixed it.
- Typed search mapped "Studio Ghibli" to a photo app. Exact-name resolution first fixed it.
- Qloo recognised about 30% of 300 random Amazon listings, and two in three for music and film. That decided the vertical: a culture store.

## What we learned

Precision alone does not show what Qloo adds. The part a model without Qloo cannot do is measure what a shop is missing for a given taste, and place a brand-new title before anyone has bought it.

## What's next

Import a shop's own catalog, keep demand per store instead of per browser, and send a weekly restock note.

## Built with

Qloo Taste AI API, Claude Haiku 4.5 (Anthropic API, tool use), Next.js, TypeScript, Vercel, Higgsfield (generated artwork), iTunes Search API and Open Library (catalog data).

## Honest limits

The store, prices and demo shoppers are made up; demo demand comes from the 40 test shoppers plus your own requests, stored in your browser. One-click examples replay recorded runs of the live agent; typed requests run live. Cover art thumbnails are in the repository only to illustrate the demo store; they belong to their rights holders.
