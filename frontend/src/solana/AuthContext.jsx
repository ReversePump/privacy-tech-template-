import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { toast } from "sonner";
import { errorMessage } from "../lib/api";

const API = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = "weft:session";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const { publicKey, signMessage, connected } = useWallet();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [wallet, setWallet] = useState(null);
  const [user, setUser] = useState(null); // {email, wallet, authType}
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!token) { setSignedIn(false); return; }
    fetch(`${API}/api/me/local`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setWallet(d.wallet);
        setUser({ email: d.email || null, wallet: d.wallet, authType: d.authType || "wallet" });
        setSignedIn(true);
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); setSignedIn(false); });
  }, [token]);

  // session is for a different wallet -> drop it
  useEffect(() => {
    if (signedIn && connected && publicKey && wallet && publicKey.toBase58() !== wallet) {
      setSignedIn(false);
      setWallet(null);
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [connected, publicKey, signedIn, wallet]);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error("Connect a wallet first");
    const w = publicKey.toBase58();
    const ch = await fetch(`${API}/api/auth/challenge`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }),
    }).then((r) => r.json());
    const sig = await signMessage(new TextEncoder().encode(ch.message));
    const res = await fetch(`${API}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: w, signature: bs58.encode(sig) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Sign-in failed");
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setWallet(data.wallet);
    setSignedIn(true);
    toast.success("Signed in");
    return data;
  }, [publicKey, signMessage]);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setWallet(null);
    setSignedIn(false);
    setUser(null);
  }, []);

  const emailAuth = useCallback(async (mode, email, password) => {
    const r = await fetch(`${API}/api/auth/email/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "failed");
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setWallet(data.wallet);
    setUser({ email: data.email, wallet: data.wallet, authType: "email" });
    setSignedIn(true);
    return data;
  }, []);

  return (
    <AuthCtx.Provider value={{ token, wallet, user, signedIn, signIn, signOut, emailAuth }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
