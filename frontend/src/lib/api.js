const BASE = process.env.REACT_APP_BACKEND_URL;

async function req(method, path, body) {
  const r = await fetch(`${BASE}/api/relay${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = typeof data?.error === "string" ? data.error : data?.message || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

// POST + SSE reader (EventSource can't POST) — yields {event, data}
export async function* sseStream(path, body) {
  const r = await fetch(`${BASE}/api/relay${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`Request failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const m = p.match(/^event:\s*(\w+)\s*\ndata:\s*([\s\S]*)$/m);
      if (m) {
        try {
          yield { event: m[1], data: JSON.parse(m[2]) };
        } catch { /* keep-alive lines */ }
      }
    }
  }
}

export const weft = {
  stats: () => req("GET", "/stats"),
  health: () => req("GET", "/health"),
  strategies: () => req("GET", "/strategies"),
  examples: () => req("GET", "/strategies/examples"),
  traders: () => req("GET", "/traders"),
  leaderboard: () => req("GET", "/leaderboard"),
  revenue: () => req("GET", "/revenue"),
  rewards: () => req("GET", "/rewards"),
  generate: (thesis) => req("POST", "/ai/generate", { thesis }),
  backtest: (payload) => req("POST", "/backtest", payload),
  validate: (strategy) => req("POST", "/strategies/validate", { strategy }),
};

export const errorMessage = (e) => (e instanceof Error ? e.message : String(e));
