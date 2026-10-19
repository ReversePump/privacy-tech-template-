import React, { useState } from "react";
import { X, Mail, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "../solana/AuthContext";
import { errorMessage } from "../lib/api";

export default function AuthModal({ open, onClose }) {
  const [tab, setTab] = useState("email");
  const [mode, setMode] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { emailAuth, signIn } = useAuth();
  const { setVisible } = useWalletModal();

  if (!open) return null;

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
          <button onClick={onClose} className="text-[#75777d] hover:text-[#121214]" data-testid="auth-close"><X size={18} /></button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-[#75777d]">
          {mode === "register" ? "Email and password — a Solana wallet is generated for you instantly. Deposit SOL or USDC and trade for real." : "Your generated wallet and strategies are waiting."}
        </p>

        <div className="mt-5 flex gap-1 rounded-full border border-[#12121414] p-1">
          {[["email", "Email", Mail], ["wallet", "Wallet", Wallet]].map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`auth-tab-${k}`}
              className={`flex-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[12.5px] transition-colors ${tab === k ? "bg-[#121214] text-white" : "text-[#75777d]"}`}>
              <Icon size={13} /> {l}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <div className="mt-5 space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
              className="h-11 w-full rounded-lg border border-[#12121414] bg-[#faf9f7] px-4 text-[13.5px] outline-none focus:border-[#2b59ff55]"
              data-testid="auth-email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)"
              className="h-11 w-full rounded-lg border border-[#12121414] bg-[#faf9f7] px-4 text-[13.5px] outline-none focus:border-[#2b59ff55]"
              data-testid="auth-password"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button onClick={submit} disabled={busy || !email || password.length < 8} data-testid="auth-submit"
              className="h-11 w-full rounded-full bg-[#121214] text-[13px] font-medium text-white hover:bg-[#2b59ff] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === "register" ? "Create account + wallet" : "Log in"}
            </button>
            <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="w-full text-center text-[12px] text-[#75777d] hover:text-[#2b59ff]" data-testid="auth-switch-mode">
              {mode === "register" ? "Already have an account? Log in" : "New here? Create an account"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <button onClick={walletSignIn} data-testid="auth-wallet-btn"
              className="h-11 w-full rounded-full border border-[#12121414] text-[13px] font-medium hover:border-[#2b59ff] hover:text-[#2b59ff] transition-colors inline-flex items-center justify-center gap-2">
              <Wallet size={14} /> Connect Phantom / Solflare
            </button>
            <p className="mt-3 text-center text-[11px] text-[#75777d]">Your own wallet, your keys — sign a message to sign in.</p>
          </div>
        )}
      </div>
    </div>
  );
}
