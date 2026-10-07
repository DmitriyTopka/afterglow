// The judges' pass: a link with ?pass=... unlocks the live agent while the public demo runs on recorded runs.
// The browser keeps it for the visit and sends it with every request to the live routes.
const KEY = "afterglow-pass";

export function passHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window === "undefined") return headers;
  let pass = "";
  try {
    const fromLink = new URLSearchParams(window.location.search).get("pass");
    if (fromLink) localStorage.setItem(KEY, fromLink);
    pass = fromLink ?? localStorage.getItem(KEY) ?? "";
  } catch { /* storage blocked: the link still works on this page */ }
  if (pass) headers["x-afterglow-pass"] = pass.slice(0, 100);
  return headers;
}
