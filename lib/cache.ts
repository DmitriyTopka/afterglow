// Two-level cache: in-process Map, then JSON files on disk (best effort; read-only disks just skip it).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const mem = new Map<string, unknown>();
const DIR = process.env.VERCEL ? "/tmp/taste-cache" : path.join(process.cwd(), ".cache");

function keyOf(ns: string, payload: unknown): string {
  return ns + "-" + createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export async function cached<T>(ns: string, payload: unknown, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const key = keyOf(ns, payload);
  if (mem.has(key)) return { value: mem.get(key) as T, hit: true };
  const file = path.join(DIR, key + ".json");
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as T;
    mem.set(key, value);
    return { value, hit: true };
  } catch {}
  const value = await fn();
  mem.set(key, value);
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file, JSON.stringify(value));
  } catch {}
  return { value, hit: false };
}
