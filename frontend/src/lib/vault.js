import bs58 from "bs58";

const API = process.env.REACT_APP_BACKEND_URL;

export const isMobileDevice = () =>
  /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  !!window.matchMedia?.("(pointer: coarse)").matches;

async function postJSON(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || data?.error || `Request failed (${r.status})`);
  return data;
}

export const vaultBalance = (wallet, mint) =>
  fetch(`${API}/api/vault/balance/${wallet}${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`).then((r) => r.json());

export const vaultPositions = (wallet) =>
  fetch(`${API}/api/vault/positions/${wallet}`).then((r) => r.json());

export async function vaultWithdraw({ mint, publicKey, signMessage }) {
  const wallet = publicKey.toBase58();
  const ts = Date.now();
  const msg = `MakeMarkets vault withdrawal\nwallet: ${wallet}\nmint: ${mint || ""}\nts: ${ts}`;
  const sig = await signMessage(new TextEncoder().encode(msg));
  return postJSON("/api/vault/withdraw", { wallet, mint: mint || null, ts, signature: bs58.encode(sig) });
}
