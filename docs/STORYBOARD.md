# Storyboard: the judge's 3 minutes (06.10.2026)

Goal: in 3 minutes a judge who has never seen the project understands
(1) this is a culture store, (2) the shopper gets picks with a plain "why",
(3) the owner gets a taste map of their own catalog that nobody else shows.

## 0:00 Landing (one screen, no scrolling needed)
- Dark "night record shop" page. The hero is the taste map: 344 real covers in 9 named islands.
- One line over it: "A store that knows its own taste. Built from Qloo taste data, no hand tagging."
- Toggle at the top: Shopper | Owner. Shopper is on by default.
- Four examples in one click, no empty text box:
  - "Arthouse films and late-night jazz"
  - "Quotes Tarantino, plays The Last of Us"
  - "Taylor Swift and cozy fantasy books"
  - "Led Zeppelin on vinyl, loves war history"
- Footer strip: "Powered by Qloo: search, insights with explainability, 5 entity types".

## 0:15 Shopper: click an example
- Answers for the four examples are saved in the repo and appear at once; typed requests go live.
- Agent steps appear one by one on the left (read request, found in Qloo, scored 344 items).
- On the map: the islands that match light up, thin lines run from the taste to 5 picks.
- Shelf of 5 picks with covers. Plain language: "Fans of Tarantino pick this 3x more than the average shopper".
  Direct matches say so: "By Tarantino, named in your request".
- No SD numbers here.

## 1:00 Owner: flip the toggle
- Same map, now with section cards: name, size, mix of formats, top covers.
- Click a section: "Who shops here" (the tastes that lean into it) and "What to stock next":
  titles Qloo says this audience loves that the store does not carry.
- Owner view shows the numbers (affinity, lift in SD) and a "How this was built" link.

## 1:50 Cold start: add a new product
- Button "Add a new product". Pick one of 5 new releases (or type a title).
- The agent finds it in Qloo, scores it against the same probe tastes, and drops the cover onto its island:
  "Lands in Indie Reflections, closest to Lost in Translation and Kind of Blue".
- Message: no sales history, no tags, placed in seconds.

## 2:30 How it works (one scroll down)
- 4 boxes: Qloo search, Qloo insights, taste vectors, Claude Haiku for reading requests.
- Honest numbers: coverage on 300 real Amazon listings, the with/without Qloo test, method linked.

## Mobile (375px)
- No full map. Sections as a vertical list of cards with a cover strip; tap opens the section grid.
- Shopper flow is the same: examples, steps, 5 picks as a horizontal shelf.

## Fallbacks
- Saved answers for the 4 examples and the 5 cold-start products; shown when Qloo or Claude fail.
- Static map layout (computed offline); only the lines animate.

## Open questions
- CLOSED 06.10: "What to stock next" = Qloo insights with the section's top 5 items as signals, minus titles
  the store carries (scripts/stock_next.mts, 9 calls for 3 sections). Results make sense, for example
  Indie Reflections -> Rushmore, The Darjeeling Limited, Pavement, Jeff Buckley, Everything is Illuminated;
  Classic Rock Legends -> The Who, Cream, Fear and Loathing in Las Vegas, Beatles biographies.
- Cold start live costs about 36 Qloo calls per product (one per probe taste). Live for typed titles,
  precomputed for the 5 demo products.
