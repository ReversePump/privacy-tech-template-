import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { local } from "./lib/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("gb_token") || "");
  const [user, setUser] = useState(null);
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const walletModal = useWalletModal();
  const pendingWallet = useRef(false);

  const refresh = useCallback(async (tok = token) => {
    if (!tok) return;
    try {
      const d = await local.get("/me", tok);
      setUser({ ...d.user, seats: d.seats, pulls: d.pulls });
    } catch {
      /* expired */
    }
  }, [token]);

  useEffect(() => { if (token) refresh(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!token) return;
    const iv = setInterval(() => refresh(), 20000);
    return () => clearInterval(iv);
  }, [token, refresh]);

  const save = (tok, u) => {
    localStorage.setItem("gb_token", tok);
    setToken(tok);
    setUser(u);
  };

  const emailAuth = async (mode, email, password) => {
    const d = await local.post(`/auth/${mode}`, { email, password });
    save(d.token, d.user);
    return d.user;
  };

  // wallet sign-in: connect (picker if needed) → sign challenge → session
  useEffect(() => {
    if (connected && publicKey && pendingWallet.current) {
      pendingWallet.current = false;
      (async () => {
        try {
          const wallet = publicKey.toBase58();
          const { message } = await local.post("/auth/wallet/challenge", { wallet });
          const sig = await signMessage(new TextEncoder().encode(message));
          const bs58 = (await import("bs58")).default;
          const d = await local.post("/auth/wallet/verify", { wallet, signature: bs58.encode(sig) });
          save(d.token, d.user);
          toast.success("Wallet signed in — $250 practice credits added");
        } catch (e) {
          toast.error(e.message || "Wallet sign-in failed");
        }
      })();
    }
  }, [connected, publicKey]); // eslint-disable-line

  const walletSignIn = async () => {
    if (!connected) {
      pendingWallet.current = true;
      walletModal.setVisible(true);
      return;
    }
    pendingWallet.current = true;
    try {
      await disconnect();
    } catch { /* noop */ }
    walletModal.setVisible(true);
  };

  const logout = () => {
    localStorage.removeItem("gb_token");
    setToken("");
    setUser(null);
    if (connected) disconnect().catch(() => {});
  };

  return (
    <Ctx.Provider value={{ token, user, setUser, emailAuth, walletSignIn, logout, refresh, connected }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
