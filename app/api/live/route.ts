import saved from "@/data/saved_answers.json";
import { runAgentic } from "@/lib/agent/agentic";
import { allow } from "@/lib/limits";

export const maxDuration = 60;

// Streams the agent's steps as they happen (newline-delimited JSON), then the full result.
// One-click examples replay their recorded run at a steady pace, so the demo is reproducible.
const SAVED = saved as Record<string, { steps: unknown[] }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  const recorded = SAVED[message];
  if (!recorded) {
    const gate = allow(req);
    if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (recorded) {
          send({ type: "mode", replay: true });
          for (const s of recorded.steps) { await sleep(900); send({ type: "step", step: s }); }
          await sleep(500);
          send({ type: "result", result: { ...recorded, replay: true } });
        } else {
          send({ type: "mode", replay: false });
          const result = await runAgentic(message, (s) => send({ type: "step", step: s }));
          send({ type: "result", result });
        }
      } catch (err) {
        console.error(err);
        send({ type: "error", error: "The agent failed on this request. Try one of the examples." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
