import React, { useState } from "react";
import { X, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "../solana/AuthContext";
import { errorMessage } from "../lib/api";

export default function AuthModal({ open, onClose }) {
  const [mode, setMode] = useState("register"); // register | login | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { emailAuth, signIn } = useAuth();
  const { setVisible } = useWalletModal();

  if (!open) return null;

  const forgot = async () => {
    setBusy(true);
    try {
      await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/email/reset_request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      setMode("reset");
      toast.success("If that email is registered, a 6-digit code is on its way");
    } catch { toast.error("Could not send the code right now"); } finally { setBusy(false); }
  };

  const resetPw = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/email/reset_confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "failed");
      toast.success("Password updated — log in with the new one");
      setMode("login");
      setPassword("");
      setCode("");
    } catch (e) {
      const m = errorMessage(e);
      toast.error(m === "invalid_code" ? "Wrong or expired code" : m === "password_too_short" ? "Password needs at least 8 characters" : m);
    } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await emailAuth(mode, email, password);
      toast.success(mode === "register" ? "Account created — your wallet is ready" : "Welcome back");
      onClose();
    } catch (e) {
      const m = errorMessage(e);
      toast.error(m === "email_taken" ? "That email is registered — log in instead" : m === "invalid_credentials" ? "Wrong email or password" : m === "password_too_short" ? "Password needs at least 8 characters" : m);
    } finally {
      setBusy(false);
    }
  };

  const walletSignIn = async () => {
    try {
      await signIn();
      onClose();
    } catch (e) {
      if (!/connect/i.test(errorMessage(e))) toast.error(errorMessage(e));
      else setVisible(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose} data-testid="auth-modal">
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="serif text-2xl font-light">{mode === "register" ? "Create your account" : "Welcome back"}</h2>
          <button onClick={onClose} className="text-[#9aa0ae] hover:text-[#f4f4f5]" data-testid="auth-close"><X size={18} /></button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-[#9aa0ae]">
          {mode === "register" ? "Email and password — a Solana wallet is generated for you instantly. Or connect your own wallet below: your keys, only you can withdraw." : "Your generated wallet and strategies are waiting."}
        </p>

        {mode === "forgot" ? (
            <div className="mt-5 space-y-3">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                className="h-11 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 text-[13.5px] outline-none focus:border-[#ffffff66]"
                data-testid="forgot-email" />
              <button onClick={forgot} disabled={busy || !email} data-testid="forgot-submit"
                className="h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />} Email me a reset code
              </button>
              <button onClick={() => setMode("login")} className="w-full text-center text-[12px] text-[#9aa0ae] hover:text-[#cbd5e1]" data-testid="forgot-back">
                Back to log in
              </button>
            </div>
          ) : mode === "reset" ? (
            <div className="mt-5 space-y-3">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code from your email"
                className="h-11 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 mono text-[15px] tracking-[0.3em] outline-none focus:border-[#ffffff66]"
                data-testid="reset-code" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)"
                className="h-11 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 text-[13.5px] outline-none focus:border-[#ffffff66]"
                data-testid="reset-password" />
              <button onClick={resetPw} disabled={busy || code.length !== 6 || password.length < 8} data-testid="reset-submit"
                className="h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />} Set new password
              </button>
            </div>
          ) : (
          <div className="mt-5 space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
              className="h-11 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 text-[13.5px] outline-none focus:border-[#ffffff66]"
              data-testid="auth-email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)"
              className="h-11 w-full rounded-lg border border-[#ffffff26] bg-[#17171b] px-4 text-[13.5px] outline-none focus:border-[#ffffff66]"
              data-testid="auth-password"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button onClick={submit} disabled={busy || !email || password.length < 8} data-testid="auth-submit"
              className="h-11 w-full rounded-full bg-[#e5e7eb] text-[13px] font-medium text-black shadow-[0_0_20px_rgba(226,232,255,0.35)] hover:bg-[#f1f5f9] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === "register" ? "Create account + wallet" : "Log in"}
            </button>
            <div className="flex justify-between text-[12px]">
              <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="text-[#9aa0ae] hover:text-[#cbd5e1]" data-testid="auth-switch-mode">
                {mode === "register" ? "Already have an account? Log in" : "New here? Create an account"}
              </button>
              {mode === "login" && (
                <button onClick={() => setMode("forgot")} className="text-[#9aa0ae] hover:text-[#cbd5e1]" data-testid="auth-forgot">
                  Forgot password?
                </button>
              )}
            </div>
          </div>
          )}

        {(mode === "register" || mode === "login") && (
          <div className="mt-5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#ffffff26]" />
              <span className="mono text-[10px] uppercase tracking-wider text-[#6b7280]">or your own wallet</span>
              <div className="h-px flex-1 bg-[#ffffff26]" />
            </div>
            <button onClick={walletSignIn} data-testid="auth-wallet-btn"
              className="mt-4 h-11 w-full rounded-full border border-[#ffffff26] text-[13px] font-medium hover:border-[#f1f5f9] hover:text-[#cbd5e1] transition-colors inline-flex items-center justify-center gap-2">
              <Wallet size={14} /> Connect Phantom / Solflare
            </button>
            <p className="mt-3 text-center text-[11px] text-[#9aa0ae]">Your own wallet, your keys — sign a message to sign in. Only you can withdraw.</p>
          </div>
        )}
      </div>
    </div>
  );
}
