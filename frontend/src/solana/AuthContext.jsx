import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { makers, getToken, setToken, errorMessage } from "../lib/api";

const AuthCtx = createContext(null);

// Parse the API's SIWS-style challenge message back into a structured input,
// exactly like the reference client does, so wallets with native sign-in use it.
function parseSiws(message, fallbackAddress) {
  const lines = message.split("\n");
  const m = { domain: undefined, address: fallbackAddress, statement: undefined, uri: undefined, version: undefined, nonce: undefined, issuedAt: undefined, expirationTime: undefined, requestId: undefined };
  const head = lines[0]?.match(/^(.+?) wants you to sign in with your Solana account:?$/);
  if (head) m.domain = head[1];
  if (lines[1]) m.address = lines[1].trim() || fallbackAddress;
  for (const l of lines) {
    const [k, ...rest] = l.split(": ");
    const v = rest.join(": ").trim();
    if (k === "URI") m.uri = v;
    else if (k === "Version") m.version = v;
    else if (k === "Nonce") m.nonce = v;
    else if (k === "Issued At") m.issuedAt = v;
    else if (k === "Expiration Time") m.expirationTime = v;
    else if (k === "Request ID") m.requestId = v;
  }
  // statement = free text between the address line and the first "Key: value" field
  const idx = lines.findIndex((l) => l.startsWith("URI:"));
  if (idx > 2) {
    const stmt = lines.slice(2, idx).join("\n").trim();
    if (stmt) m.statement = stmt;
  }
  return m;
}

const wasRejected = (e) =>
  /reject|declin|cancel|denied/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));

export function AuthProvider({ children }) {
  const { publicKey, signMessage, signIn: walletSignIn, connected } = useWallet();
  const [session, setSession] = useState(null); // {wallet}
  const [status, setStatus] = useState("idle"); // idle|signing|verifying|failed
  const [error, setError] = useState(null);

  const signIn = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet first.");
    setError(null);
    const wallet = publicKey.toBase58();
    const ch = await makers.challenge(wallet);

    let signature = null;
    setStatus("signing");

    // 1) raw message signing first — wallets that domain-check SIWS (Phantom)
    //    hard-block signIn on proxied domains, but still show signMessage with a warning.
    if (typeof signMessage === "function") {
      try {
        signature = bs58.encode(await signMessage(new TextEncoder().encode(ch.message)));
      } catch (e) {
        if (wasRejected(e)) {
          throw new Error("Sign-in was declined in your wallet. Tap approve on the prompt to continue — it only proves wallet ownership, it cannot spend or launch anything.");
        }
        // fall through to wallet-native sign-in
      }
    }

    // 2) wallet-native sign-in fallback (wallets without signMessage, e.g. some MWA wallets)
    if (!signature && typeof walletSignIn === "function") {
      try {
        const out = await walletSignIn(parseSiws(ch.message, wallet));
        const addr = out?.account?.address;
        if (addr && addr !== wallet) {
          throw new Error("Your wallet signed in with a different account. Switch back to the connected one.");
        }
        if (out?.signature) signature = bs58.encode(Uint8Array.from(out.signature));
      } catch (e) {
        if (wasRejected(e)) {
          throw new Error("Sign-in was declined in your wallet. Tap approve on the prompt to continue — it only proves wallet ownership, it cannot spend or launch anything.");
        }
        throw e;
      }
    }

    if (!signature) throw new Error("This wallet cannot sign messages. Try Phantom or Solflare.");

    setStatus("verifying");
    const res = await makers.verify({ challengeId: ch.challengeId, signature });
    const token = res?.token || res?.session?.token || res?.sessionToken || res?.jwt || null;
    if (token) setToken(token);
    setSession({ wallet });
    setStatus("idle");
    return res;
  }, [publicKey, signMessage, walletSignIn]);

  const signOut = useCallback(async () => {
    try { await makers.logout(); } catch { /* noop */ }
    setToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!connected) setSession(null);
  }, [connected]);

  // attempt sign-in once right after connect, so launch/onboard flows don't surprise mid-way
  useEffect(() => {
    if (connected && publicKey && !getToken()) {
      const t = setTimeout(() => {
        signIn().catch(() => { /* user can retry from the wallet menu or any action */ });
      }, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  const value = {
    session,
    signedIn: !!getToken() && !!session,
    status,
    error,
    signIn: async () => {
      try { return await signIn(); } catch (e) { setStatus("failed"); setError(errorMessage(e)); throw e; }
    },
    signOut,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
