import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { makers, getToken, setToken, errorMessage } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const { publicKey, signMessage, connected } = useWallet();
  const [session, setSession] = useState(null); // {wallet}
  const [status, setStatus] = useState("idle"); // idle|signing|verifying|failed
  const [error, setError] = useState(null);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error("This wallet cannot sign messages.");
    setError(null);
    const wallet = publicKey.toBase58();
    setStatus("signing");
    const ch = await makers.challenge(wallet);
    let sig;
    try {
      sig = await signMessage(new TextEncoder().encode(ch.message));
    } catch (e) {
      setStatus("failed");
      throw new Error("Sign-in was cancelled in your wallet.");
    }
    setStatus("verifying");
    const res = await makers.verify({ challengeId: ch.challengeId, signature: bs58.encode(sig) });
    const token = res?.token || res?.session?.token || res?.sessionToken || res?.jwt || null;
    if (token) setToken(token);
    setSession({ wallet });
    setStatus("idle");
    return res;
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    try { await makers.logout(); } catch { /* noop */ }
    setToken(null);
    setSession(null);
  }, []);

  useEffect(() => {
    if (!connected) setSession(null);
  }, [connected]);

  const value = {
    session,
    signedIn: !!getToken() && !!session,
    status,
    error,
    signIn: async () => {
      try { return await signIn(); } catch (e) { setError(errorMessage(e)); throw e; }
    },
    signOut,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
