import saved from "@/data/saved_answers.json";
import { QlooUnavailable } from "@/lib/qloo/client";
import { runAgentic } from "@/lib/agent/agentic";
import { allow } from "@/lib/limits";
import { lane, liveFor, nearestSaved, PAUSED_NOTE } from "@/lib/access";

export const maxDuration = 60;

// Streams the agent's steps as they happen (newline-delimited JSON), then the full result.
// One-click examples replay their recorded run at a steady pace, so the demo is reproducible.
const SAVED = saved as Record<string, { steps: unknown[]; savedAt?: string }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown; live?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  const access = liveFor(req);
  let recorded = (body.live === true && access.live) || !Object.hasOwn(SAVED, message) ? undefined : SAVED[message]; // live: true runs an example for real
  // Live mode is closed and there is no pass: answer with the recorded run closest to this request, never a weak one.
  const pausedFor = !recorded && !access.live ? nearestSaved(message) : null;
  if (pausedFor) recorded = SAVED[pausedFor];
  if (!recorded) {
    const gate = access.judge ? allow(req, "live-judge", 100, 1000) : allow(req, "live");
    if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (recorded) {
          send({ type: "mode", replay: true, savedAt: recorded.savedAt ?? null, paused: pausedFor ? { note: PAUSED_NOTE, request: pausedFor } : null });
          for (const s of recorded.steps) { await sleep(900); send({ type: "step", step: s }); }
          await sleep(500);
          send({ type: "result", result: { ...recorded, replay: true } });
        } else {
          send({ type: "mode", replay: false });
          const result = await lane.run({ judge: access.judge }, () => runAgentic(message, (s) => send({ type: "step", step: s })));
          send({ type: "result", result });
        }
      } catch (err) {
        console.error(err);
        send({ type: "error", error: err instanceof QlooUnavailable ? err.message : "The agent failed on this request. Try one of the examples." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
