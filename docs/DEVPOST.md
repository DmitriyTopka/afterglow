# Afterglow: your shop sees what sold. Afterglow sees what walked out.

Tagline (Devpost, max 200 chars): For independent record and book shops: Claude agents on Qloo find gifts on your shelves and turn every title a shopper couldn't find into your next order.

Live demo: https://taste-layer-alpha.vercel.app (start with "Watch both sides at once")
Video (63 s): https://youtu.be/18Ok8CbCea8
Code: https://github.com/DmitriyTopka/afterglow (MIT)

## Who it's for, and what it costs them

Independent record shops and bookstores. US vinyl sales reached $1.04B in 2025, up 9.3% (RIAA), and retail as a whole loses about $1.73 trillion a year to items that are out of stock or overstocked (IHL Group, 2025). A chain sees every click. A small shop sees what sold and never learns what someone came in for and left without.

## A real shop, run through Afterglow

We took the 500 best-selling items from the public catalog of Waterloo Records, an independent record store in Austin, Texas (no affiliation), and asked Qloo two questions. Page: https://taste-layer-alpha.vercel.app/real

- **Does the shelf know its city?** Qloo's location signal returns the 50 artists Austin over-indexes on. 9 of them are in this best-seller list.
- **Does it fit the shoppers?** For our 20 demo shoppers with music tastes, 36 of the 181 records their tastes love most are on this shelf; 7 of 20 would find nothing. At this list's median price of $27.99, that's roughly $196 walking out per 20 such requests (a rough estimate: one record each).
- Qloo recognised 192 of the 217 artists on the shelf by exact name (88%; a name Qloo spells differently counts as unknown), against about 30% for random Amazon listings. That gap is why we built for a culture shop.

## What Claude alone can't do here

Ask Claude what a fan of Joy Division would like, and it will answer well. Ask it which of those things your shop is missing, how many of today's shoppers left without them, or where a record nobody has bought yet belongs on your shelves, and it can only guess. Those three answers come from Qloo:

1. **The store check.** For every request the agent asks Qloo for the ten titles that taste loves most anywhere, and counts what the shop carries. Joy Division and Murakami: 3 of 10 in stock. The Smiths, Gang of Four and Echo & the Bunnymen go on the owner's list.
2. **The demand ledger.** Across 38 demo shoppers, 81.6% of what their tastes love is not on these shelves, spread over 295 titles their tastes love that the shop doesn't carry. The owner's agent turns that into three titles to order.
3. **The cold start.** A title with no sales and no tags gets scored against 36 reference tastes and lands next to its closest titles on the store map. Judas Priest lands beside Iron Maiden and Megadeth.

## Inspiration

Independent record shops and bookstores lose to big platforms on data. A chain sees every click. A small shop sees what sold and never learns what someone came in for. We wanted a shop assistant that remembers that part, and an owner's view that turns it into the next order.

## What it does

Afterglow is a demo culture store with 384 real titles (vinyl, books, films, games, TV box sets) and fictional prices.

**The shop assistant.** You write the way you'd talk to a clerk: "He's into Joy Division and rereads Murakami every winter." Claude Haiku works through Qloo with six tools and decides what to call: find the tastes (a genre becomes representative works, so "old westerns" turns into The Lone Ranger and Bonanza), score the whole catalog once, check the shelves, look up who the fans are, ask a question when there is nothing to go on, recommend. Five titles across formats come back, and each one carries a fact from Qloo, not just the model's words: "Qloo: #2 of 90 films here for fans of Joy Division." A reason that names a genre the title's own data doesn't support gets rewritten from data.

**The owner's agent.** Reads the unmet demand, checks who loves each candidate with Qloo demographics, and proposes three titles with the coverage they'd reach (18.4% to 20.0% on the demo demand). Next to each pick the app shows which shopper tastes asked for it, its map section and its audience, straight from the tool data.

**Qloo, visible.** The shopper sees how Qloo reads the taste ("Post-punk, New wave, Magical Realism" for Joy Division and Murakami), the recipient's age and gender go to Qloo as demographic signals when the message gives them ("my dad, 62"), and a panel lists every Qloo call the agent made, grouped by endpoint and parameters.

**Check your own shop.** Paste up to 30 things you stock. Qloo resolves each line and the same shopper demand is measured against your shelf: how many shoppers would find something their taste loves, and what to stock next.

**The live screen.** Shopper on the left, the agent's steps streaming in. Owner on the right, the new demand landing a moment later. Below, the whole store lights up: every cover glows by how much this taste loves it.

**The full path.** Product pages, a bag with "complete the gift", and a demo checkout that asks "Who is it for?" and shows what the order taught the store.

## Trust

No personal data: Qloo describes groups of people with similar tastes, never one person, and the demo keeps a shopper's requests in their own browser. Every pick carries a Qloo fact; a reason that claims a genre the title's own data doesn't support is rewritten from data. Live Qloo calls pause before the monthly quota runs out, and the examples keep working from recorded Qloo data.

## How we built it

Next.js on Vercel, Claude Haiku 4.5 with tool use, and these Qloo calls:

| What | Qloo endpoint |
|---|---|
| Find what the shopper named | `GET /search` (exact name match first, typed search second) |
| Score all 384 titles for a taste, and which taste drove each match | `GET /v2/insights` with `filter.results.entities` and `feature.explainability` |
| Store check: what this taste loves most anywhere | `GET /v2/insights` without a catalog filter, per format |
| How Qloo reads the taste | `GET /v2/insights` with `filter.type=urn:tag` (taste analysis) |
| Who the gift is for | `signal.demographics.age` and `signal.demographics.gender` on scoring and the store check |
| Who loves it | `GET /v2/insights` with `filter.type=urn:demographics` |
| What a city loves | `GET /v2/insights` with `signal.location.query` (the real-shelf page) |
| Taste map and cold start | `GET /v2/insights` against 36 reference tastes |
| Check your own shop | `GET /search` per pasted line |

The map uses each title's affinity for the 36 reference tastes, centred per format and clustered (k-means, 9 sections). Caps: 6 model turns and 25 live Qloo calls per request; per-route daily limits; live Qloo calls pause when the monthly quota runs low, and the examples keep working from recorded Qloo data.

## How we measured it

A separate blind agent, which saw only the catalog, wrote and labelled 40 shopper requests before we tuned anything. A second blind agent judged every pick the labels did not cover. We tuned on the odd-numbered requests and never on the even ones.

Against Claude reading the whole catalog as text (same model, no Qloo), on the 20 requests we never tuned on:

| | P@3, blind labels | P@3, labels + blind judge | wins / losses (labels) |
|---|---|---|---|
| Afterglow agent | 0.52 | 0.63 | 11 / 4 |
| Claude alone | 0.37 | 0.55 | |

Claude alone also put 12 over-budget titles in its top three across the 40 requests; the agent put none. Our first version only tied Claude on that half; grounding the reasons in Qloo data and letting the agent choose its own route is what moved it. An earlier test on a small hand-tagged catalog went the other way (hand tags beat Qloo), and that result is in the repo too.

Claude alone only works because 384 titles fit in a prompt. A real shop with 50,000 titles doesn't, and Qloo scoring doesn't care how big the catalog is.

## Challenges

- Qloo never returns the signal itself, so a shop built from Qloo's suggestions was missing Taylor Swift and Miles Davis. We added the seeds back.
- Raw affinity follows popularity: LEGO topped every early list. Per-format percentiles fixed it.
- Typed search mapped "Studio Ghibli" to a photo app. Exact-name resolution first fixed it.
- The model wrote confident nonsense ("The Mule, a modern western"). Reasons now have to match the title's own Qloo tags, and the owner's plan shows facts from tool data instead of the model's summary.
- Qloo recognised about 30% of 300 random Amazon listings, and two in three for music and film. That decided the vertical: a culture store.

## What's next

Keep demand per store on a server instead of per browser, send a weekly restock note, and import a full catalog file. The same engine fits a venue: which artists does your audience love that you never book.

## Built with

Qloo Taste AI API, Claude Haiku 4.5 (Anthropic API, tool use), Next.js, TypeScript, Vercel, Higgsfield (generated artwork), iTunes Search API and Open Library (catalog data).

## Honest limits

The store, prices and demo shoppers are made up; demo demand comes from 38 test shoppers plus your own requests, stored in your browser. One-click examples replay recorded runs of the live agent; typed requests run live. The Waterloo page measures coverage only: we have no blind labels for that catalog, so recommendation quality there is not measured. The Waterloo numbers come from one read of the shop's public catalog feed; only artist names, counts and prices are kept. Cover art thumbnails are in the repository only to illustrate the demo store; they belong to their rights holders.
