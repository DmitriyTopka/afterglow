import saved from "@/data/saved_answers.json";
import { QlooUnavailable } from "@/lib/qloo/client";
import { runAgentic } from "@/lib/agent/agentic";
import { allow } from "@/lib/limits";

// One-click examples answer from data/saved_answers.json (instant, and still works if Qloo or Claude is down).
const SAVED = saved as Record<string, unknown>;

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (Object.hasOwn(SAVED, message)) return Response.json({ ...(SAVED[message] as object), saved: true });
  const gate = allow(req, "recommend");
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429 });
  try {
    return Response.json(await runAgentic(message));
  } catch (err) {
    if (err instanceof QlooUnavailable) return Response.json({ error: err.message, offline: true }, { status: 503 });
    console.error(err);
    return Response.json({ error: "The agent failed on this request. Try one of the examples." }, { status: 502 });
  }
}
