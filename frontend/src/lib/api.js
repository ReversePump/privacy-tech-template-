const BASE = process.env.REACT_APP_BACKEND_URL;

export const money = (v, dec = 0) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

export const timeAgo = (iso) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const packArt = (price, small) => {
  const TIERS = [[25, "t25"], [50, "t50"], [100, "t100"], [250, "t250"], [500, "t500"], [1000, "t1000"], [2500, "t2500"], [1e9, "t5000"]];
  const t = TIERS.find((x) => price <= x[0])[1];
  return `${BASE}/api/img/packs/${t}${small ? "-s" : ""}.webp`;
};

async function req(method, path, body, token) {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : `Request failed (${r.status})`);
  return data;
}

export const gh = (path) => req("GET", `/gh${path}`); // relayed live platform data
export const local = {
  get: (p, token) => req("GET", p, undefined, token),
  post: (p, body, token) => req("POST", p, body ?? {}, token),
};
export { BASE };
