import React, { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

export default function AuthModal({ open, onClose }) {
  const { emailAuth, walletSignIn } = useAuth();
  const [mode, setMode] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await emailAuth(mode, email.trim(), password);
      toast.success(mode === "register" ? "Account created — $250 practice credits added" : "Welcome back");
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose} data-testid="auth-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="h2" style={{ fontSize: 20 }}>{mode === "register" ? "Create your account" : "Welcome back"}</div>
          <button className="navlink" onClick={onClose} data-testid="auth-close">✕</button>
        </div>
        <p className="mute" style={{ fontSize: 12.5, margin: "6px 0 16px" }}>
          {mode === "register" ? "Email and password — $250 practice credits added instantly. Or connect your Solana wallet below." : "Your seats, pulls and credits are waiting."}
        </p>
        <input className="input" type="email" placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)} data-testid="auth-email" autoComplete="email" />
        <input className="input" type="password" placeholder="Password (8+ characters)" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          data-testid="auth-password" style={{ marginTop: 8 }} />
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={submit}
          disabled={busy || !email || password.length < 8} data-testid="auth-submit">
          {busy ? "…" : mode === "register" ? "Create account" : "Sign in"}
        </button>
        <button className="see mute" style={{ background: "none", border: 0, marginTop: 10, fontSize: 12, width: "100%" }}
          onClick={() => setMode(mode === "register" ? "login" : "register")} data-testid="auth-switch">
          {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span className="mono dim" style={{ fontSize: 10, letterSpacing: ".1em" }}>OR WALLET</span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>
        <button className="btn btn-block" onClick={() => { walletSignIn(); }} data-testid="auth-wallet">
          Connect Phantom / Solflare
        </button>
        <p className="dim" style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>Sign a message — no approval, no funds move.</p>
      </div>
    </div>
  );
}
