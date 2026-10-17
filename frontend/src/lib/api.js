const BASE = `${process.env.REACT_APP_BACKEND_URL}/api/relay`;

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const TOKEN_KEY = "makers:session";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

export async function api(path, { method = "GET", body, raw, contentType } = {}) {
  const headers = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    if (contentType) headers["Content-Type"] = contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`${BASE}${path}`, { method, headers, body: payload, cache: "no-store" });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    throw new ApiError(r.status, data?.error, data?.message || r.statusText, data?.field);
  }
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const makers = {
  config: () => api("/config"),
  stats: () => api("/stats"),
  native: () => api("/native"),
  desks: (opts) => api(`/desks${qs(opts)}`),
  desk: (id) => api(`/desks/${encodeURIComponent(id)}`),
  trades: (id, before) => api(`/desks/${encodeURIComponent(id)}/trades${qs({ before })}`),
  chart: (id, range) => api(`/desks/${encodeURIComponent(id)}/chart${qs({ range })}`),
  feed: (limit, kind) => api(`/feed${qs({ limit, kind })}`),
  burns: () => api("/burns"),
  crown: () => api("/crown"),
  crownPrepare: (body) => api("/crown/prepare", { method: "POST", body }),
  crownSubmit: (mint, signedTransaction) =>
    api(`/crown/${encodeURIComponent(mint)}/submit`, { method: "POST", body: { signedTransaction } }),
  myDesks: () => api("/me/desks"),
  checkCoin: (mint) => api(`/coins/${encodeURIComponent(mint)}/check`),
  createDesk: (mint, settings) => api("/desks", { method: "POST", body: { mint, settings } }),
  approval: (id, action, change) =>
    api(`/desks/${encodeURIComponent(id)}/approvals`, {
      method: "POST",
      body: change === undefined ? { action } : { action, change },
    }),
  updateSettings: (id, settings) =>
    api(`/desks/${encodeURIComponent(id)}/settings`, { method: "PATCH", body: settings }),
  pause: (id) => api(`/desks/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  resume: (id) => api(`/desks/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  withdraw: (id, kind, extra) =>
    api(`/desks/${encodeURIComponent(id)}/withdraw`, { method: "POST", body: { kind, ...(extra || {}) } }),
  liquidate: (id) => api(`/desks/${encodeURIComponent(id)}/liquidate`, { method: "POST" }),
  closeDesk: (id) => api(`/desks/${encodeURIComponent(id)}/close`, { method: "POST" }),
  uploadImage: (blob) => api("/images", { method: "POST", raw: blob, contentType: blob.type || "application/octet-stream" }),
  createLaunch: (body) => api("/launches", { method: "POST", body }),
  prepareLaunch: (id) => api(`/launches/${encodeURIComponent(id)}/prepare`, { method: "POST" }),
  submitLaunch: (id, signedTransaction) =>
    api(`/launches/${encodeURIComponent(id)}/submit`, { method: "POST", body: { signedTransaction } }),
  challenge: (wallet) => api("/auth/challenge", { method: "POST", body: { wallet } }),
  verify: (body) => api("/auth/verify", { method: "POST", body }),
  logout: () => api("/auth/logout", { method: "POST" }),
};

export const errorMessage = (e) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
