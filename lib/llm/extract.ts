// Step 1 of the agent: turn a free-text shopping request into cultural signals Qloo can resolve.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { canSpend, record } from "./budget";

export const SignalKind = z.enum(["person", "artist", "movie", "tv_show", "book", "video_game", "brand", "podcast"]);

// The model sometimes answers with a kind outside the list ("band", "film", "album"). Accept any string and
// map it, so one odd label never fails the whole request; unknown kinds are searched in Qloo without a type.
const KIND_ALIASES: Record<string, z.infer<typeof SignalKind>> = {
  band: "artist", musician: "artist", singer: "artist", album: "artist", song: "artist", composer: "artist",
  film: "movie", director: "person", actor: "person", author: "person", writer: "person",
  show: "tv_show", series: "tv_show", tv: "tv_show", game: "video_game", videogame: "video_game", novel: "book",
};
export function normalizeKind(k: string): z.infer<typeof SignalKind> | null {
  const key = k.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (SignalKind.options as string[]).includes(key) ? (key as z.infer<typeof SignalKind>) : KIND_ALIASES[key.replace(/_/g, "")] ?? null;
}

export const Extraction = z.object({
  recipient: z.string().describe("Who the purchase is for, e.g. 'brother', or 'self'"),
  budget_usd: z.number().nullable().describe("Upper budget in USD if stated, else null"),
  signals: z
    .array(z.object({ name: z.string(), kind: z.string().describe(`One of: ${SignalKind.options.join(", ")}`) }))
    .describe("Named cultural entities the request mentions: creators, works, artists, games, brands"),
});
export type Extraction = z.infer<typeof Extraction>;

export const LLM_MODE = process.env.LLM_MODE === "live" ? "live" : "mock";
export const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5";
// Haiku 4.5 rejects output_config.effort; newer models accept it.
const SUPPORTS_EFFORT = !MODEL.startsWith("claude-haiku-4-5");

const SYSTEM = `You read a shopper's message for an online store and extract the cultural signals in it.
A signal is a named creator, work, artist, game, show, podcast or brand the shopper mentions as a taste reference.
Do not invent signals that are not in the message. Do not include product categories ("headphones") as signals.`;

export interface ExtractResult {
  extraction: Extraction;
  mode: "mock" | "live" | "mock-capped" | "mock-nokey";
  usd: number;
}

export async function extract(message: string): Promise<ExtractResult> {
  if (LLM_MODE === "mock") return { extraction: mockExtract(message), mode: "mock", usd: 0 };
  if (!process.env.ANTHROPIC_API_KEY) return { extraction: mockExtract(message), mode: "mock-nokey", usd: 0 };
  if (!canSpend()) return { extraction: mockExtract(message), mode: "mock-capped", usd: 0 };

  const client = new Anthropic({ timeout: 20000, maxRetries: 1 });
  let res;
  try {
    res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
    output_config: SUPPORTS_EFFORT
      ? { effort: "low", format: zodOutputFormat(Extraction) }
      : { format: zodOutputFormat(Extraction) },
    });
  } catch (err) {
    // Key revoked, credit used up, timeout: fall back to the rule-based extractor instead of failing the request.
    console.error("extract: Claude unavailable, using rules", err);
    return { extraction: mockExtract(message), mode: "mock", usd: 0 };
  }
  const usd = record(MODEL, res.usage.input_tokens, res.usage.output_tokens);
  if (res.stop_reason === "refusal" || !res.parsed_output) {
    return { extraction: mockExtract(message), mode: "mock", usd };
  }
  const out = res.parsed_output;
  return { extraction: { ...out, signals: out.signals.map((x) => ({ name: x.name, kind: normalizeKind(x.kind) ?? x.kind })) }, mode: "live", usd };
}

// Rule-based fallback: knows the names used in the demo examples. Good enough to exercise the pipeline.
const ALIASES: Array<[RegExp, string, z.infer<typeof SignalKind>]> = [
  [/\bnolan\b/i, "Christopher Nolan", "person"],
  [/\bzimmer\b/i, "Hans Zimmer", "artist"],
  [/\binterstellar\b/i, "Interstellar", "movie"],
  [/\bvilleneuve\b/i, "Denis Villeneuve", "person"],
  [/\bghibli\b/i, "Studio Ghibli", "brand"],
  [/\bmiyazaki\b/i, "Hayao Miyazaki", "person"],
  [/\bmurakami\b/i, "Haruki Murakami", "person"],
  [/\bchristie\b/i, "Agatha Christie", "person"],
  [/\bmiles davis\b/i, "Miles Davis", "artist"],
  [/\bdaft punk\b/i, "Daft Punk", "artist"],
  [/\bradiohead\b/i, "Radiohead", "artist"],
  [/\bwes anderson\b/i, "Wes Anderson", "person"],
  [/\belden ring\b/i, "Elden Ring", "video_game"],
  [/\bzelda\b/i, "The Legend of Zelda", "video_game"],
  [/\btolkien\b/i, "J.R.R. Tolkien", "person"],
  [/\bkendrick\b/i, "Kendrick Lamar", "artist"],
  [/\bpatagonia\b/i, "Patagonia", "brand"],
  [/\bblade runner\b/i, "Blade Runner", "movie"],
];

export function mockExtract(message: string): Extraction {
  const signals = ALIASES.filter(([re]) => re.test(message)).map(([, name, kind]) => ({ name, kind }));
  const budget = message.match(/(?:\$\s?(\d+))|(?:(\d+)\s?(?:usd|dollars|bucks))/i);
  const who = message.match(/\b(brother|sister|dad|father|mom|mother|girlfriend|boyfriend|wife|husband|friend|nephew|niece|colleague|son|daughter)\b/i);
  return {
    recipient: who ? who[1].toLowerCase() : "self",
    budget_usd: budget ? Number(budget[1] ?? budget[2]) : null,
    signals,
  };
}
