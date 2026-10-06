import { search, QlooUnavailable, type QlooCall } from "@/lib/qloo/client";
import { allow } from "@/lib/limits";

export const maxDuration = 60;

// "Check your own shop": the owner pastes up to 30 titles they stock (one per line: an artist, film, book, game or show).
// Each line is one Qloo search; we keep the first hit of a type a culture shop sells. The browser then measures how
// much of the demo shoppers' demand that shelf would cover. Capped hard: it spends live Qloo calls.
const SELLABLE = new Set(["urn:entity:artist", "urn:entity:book", "urn:entity:movie", "urn:entity:videogame", "urn:entity:tv_show"]);
const MAX_LINES = 30;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { lines?: unknown };
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => String(l ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean);
  const unique = [...new Set(lines.map((l) => l.toLowerCase()))].slice(0, MAX_LINES).map((l) => lines.find((x) => x.toLowerCase() === l)!);
  if (!unique.length) return Response.json({ error: "Paste at least one title, one per line." }, { status: 400 });
  const gate = allow(req, "import", 3, 10);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  const calls: QlooCall[] = [];
  try {
    const matched: Array<{ line: string; entity_id: string; name: string; type: string }> = [];
    const unknown: string[] = [];
    for (const line of unique) {
      const hit = ((await search(line, undefined, calls)).results ?? []).find((e) => SELLABLE.has(String(e.types?.[0] ?? e.type ?? "")) || (e.types ?? []).some((t: string) => SELLABLE.has(t)));
      if (hit) matched.push({ line, entity_id: hit.entity_id, name: hit.name, type: (hit.types ?? []).find((t: string) => SELLABLE.has(t)) ?? String(hit.type ?? "") });
      else unknown.push(line);
    }
    return Response.json({ matched, unknown, calls: calls.length });
  } catch (err) {
    if (err instanceof QlooUnavailable) return Response.json({ error: err.message, offline: true }, { status: 503 });
    console.error(err);
    return Response.json({ error: "Qloo could not be reached. Try again in a minute." }, { status: 502 });
  }
}
