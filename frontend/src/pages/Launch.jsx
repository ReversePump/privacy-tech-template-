import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction, Keypair } from "@solana/web3.js";
import { Upload, Rocket, Check, ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "../lib/api";
import { b64ToBytes, short, solscanAcct, solscanTx } from "../lib/format";
import { PageHead, Panel, CoinAvatar, ExtLink } from "../components/bits";

const API = process.env.REACT_APP_BACKEND_URL;
const STEPS = ["Identity", "Opening buy", "Review & launch"];

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

export default function Launch() {
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle|uploading|building|signing|sending|live|failed
  const [err, setErr] = useState(null);
  const [liveMint, setLiveMint] = useState(null);
  const [liveSig, setLiveSig] = useState(null);

  const [coin, setCoin] = useState({ name: "", ticker: "", description: "", imageId: null, imageUrl: null, links: { website: "", x: "", telegram: "" } });
  const [imageBlob, setImageBlob] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [devBuySol, setDevBuySol] = useState(0);
  const fileRef = useRef(null);

  const onImage = (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2 MB"); return; }
    setImageBlob(file);
    setImagePreview((old) => { if (old?.startsWith("blob:")) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    setCoin((c) => ({ ...c, imageId: null, imageUrl: null }));
  };

  const byteLen = (s) => new TextEncoder().encode(s).length;
  const stepOk = useMemo(() => ([
    coin.name.trim().length > 0 && byteLen(coin.name) <= 32 && coin.ticker.trim().length > 0 && byteLen(coin.ticker) <= 13 && !!imageBlob,
    devBuySol >= 0,
    true,
  ]), [coin, imageBlob, devBuySol]);

  const launch = async () => {
    if (!connected || !publicKey) { setVisible(true); return; }
    setErr(null);
    try {
      // 1. host the artwork on our own infra
      setPhase("uploading");
      let imageId = coin.imageId;
      if (!imageId) {
        const r = await fetch(`${API}/api/uploads/image`, {
          method: "POST",
          headers: { "Content-Type": imageBlob.type || "image/png" },
          body: imageBlob,
        });
        const up = await r.json();
        if (!r.ok) throw new Error(up?.error || "Image upload failed");
        imageId = up.id;
        setCoin((c) => ({ ...c, imageId, imageUrl: up.url }));
      }

      // 2. metadata JSON, hosted by us
      setPhase("building");
      const links = Object.fromEntries(Object.entries(coin.links).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const meta = await postJSON("/api/launch/metadata", {
        name: coin.name.trim(), symbol: coin.ticker.trim(), description: coin.description.trim(), imageId, links,
      });

      // 3. fresh mint keypair + unsigned create transaction (pump.fun, via our backend)
      const mintKp = Keypair.generate();
      const built = await postJSON("/api/launch/build", {
        publicKey: publicKey.toBase58(),
        mint: mintKp.publicKey.toBase58(),
        name: coin.name.trim(),
        symbol: coin.ticker.trim(),
        uri: meta.uri,
        amountSol: devBuySol || 0,
      });

      // 4. sign: mint keypair locally, then your wallet (transactions are never domain-blocked)
      setPhase("signing");
      toast.info("Approve the launch in your wallet.");
      const tx = VersionedTransaction.deserialize(b64ToBytes(built.transaction));
      tx.sign([mintKp]);
      const signed = await signTransaction(tx);

      // 5. broadcast
      setPhase("sending");
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");

      // 6. record it so the coin shows up on the site
      const mint = mintKp.publicKey.toBase58();
      await postJSON("/api/our/launches", {
        mint, name: coin.name.trim(), ticker: coin.ticker.trim(),
        imageUrl: coin.imageUrl || `${API}/api/media/${imageId}`,
        creator: publicKey.toBase58(), signature: sig,
      }).catch(() => {});

      setLiveMint(mint);
      setLiveSig(sig);
      setPhase("live");
      toast.success("Your coin is on chain.", { description: "Add its market maker next — one deposit, every dial yours." });
    } catch (e) {
      setPhase("failed");
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    }
  };

  const field = (label, node, hint, testId) => (
    <div data-testid={testId}>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#93a184]">{label}</label>
      {node}
      {hint && <p className="mt-1.5 text-[11px] font-light text-[#93a184]">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="launch-page">
      <PageHead
        kicker="Launch"
        title="Mint a coin."
        accent="Right here."
        sub="One approval mints your coin on the bonding curve — straight from this page, in any wallet. Attach its market maker in the next step. Market making can lose money."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-8">
        <nav className="hidden lg:block" data-testid="launch-steps">
          <ol className="space-y-1 border-l border-black/10">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  data-testid={`launch-step-${i}`}
                  onClick={() => i < step && setStep(i)}
                  className={`-ml-px flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left text-[13px] transition-colors ${
                    i === step ? "border-[#3F9E00] text-[#131a0f]" : i < step ? "border-transparent text-[#3F9E00]" : "border-transparent text-[#93a184]"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-[3px] border font-mono text-[10px] ${i === step ? "border-[#3F9E00] text-[#3F9E00]" : i < step ? "border-[#3F9E00]/40 bg-[#3F9E00]/10 text-[#3F9E00]" : "border-black/15"}`}>
                    {i < step ? <Check size={10} /> : i + 1}
                  </span>
                  {s}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          {step === 0 && (
            <div className="space-y-6" data-testid="launch-step-coin">
              <h2 className="text-xl font-medium text-[#131a0f]">Identity</h2>
              <p className="text-[13px] font-light text-[#5c6b50]">The face of your coin — name, ticker, artwork. Artwork and metadata are hosted by MakeMarkets and written to chain at mint.</p>
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
                <div>
                  <button onClick={() => fileRef.current?.click()} data-testid="launch-image-upload"
                    className="flex h-[180px] w-full flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-black/15 bg-black/[0.03] text-[#5c6b50] hover:border-[#3F9E00]/40 hover:text-[#3F9E00] transition-colors overflow-hidden">
                    {imagePreview ? <img src={imagePreview} alt="coin" className="h-full w-full object-cover" /> : (<><Upload size={20} /><span className="text-xs">Upload image</span><span className="text-[10px] text-[#93a184]">or drop it here</span></>)}
                  </button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                    onChange={(e) => onImage(e.target.files?.[0])} data-testid="launch-image-input" />
                  <p className="mt-2 text-[10px] font-light text-[#93a184]">PNG, JPEG, WEBP or GIF, up to 2 MB. Square works best.</p>
                </div>
                <div className="space-y-5">
                  {field(`Name · ${byteLen(coin.name)} / 32 bytes`,
                    <input data-testid="launch-name" className="h-11 w-full rounded-[3px] border border-black/10 bg-black/5 px-3.5 text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="Coin name" value={coin.name} onChange={(e) => setCoin({ ...coin, name: e.target.value })} />)}
                  {field(`Ticker · ${byteLen(coin.ticker)} / 13 bytes`,
                    <input data-testid="launch-ticker" className="h-11 w-full rounded-[3px] border border-black/10 bg-black/5 px-3.5 font-mono text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="$ TICKER" value={coin.ticker} onChange={(e) => setCoin({ ...coin, ticker: e.target.value.toUpperCase().replace(/\s/g, "") })} />)}
                </div>
              </div>
              <Panel className="border-[#3F9E00]/20 bg-[#3F9E00]/5 p-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#3F9E00]">Set in stone</span>
                <p className="mt-1 text-[12px] font-light text-[#5c6b50]">Name, ticker and artwork are written into the coin itself at mint. No one edits them later — not even you.</p>
              </Panel>
              {field(`Description · optional · ${byteLen(coin.description)} / 1000`,
                <textarea data-testid="launch-description" rows={3} className="w-full rounded-[3px] border border-black/10 bg-black/5 px-3.5 py-2.5 text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="What the coin is about, in a sentence or two." value={coin.description} onChange={(e) => setCoin({ ...coin, description: e.target.value })} />)}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {field("Website · optional", <input data-testid="launch-website" className="h-10 w-full rounded-[3px] border border-black/10 bg-black/5 px-3 text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="https://" value={coin.links.website} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, website: e.target.value } })} />)}
                {field("X · optional", <input data-testid="launch-x" className="h-10 w-full rounded-[3px] border border-black/10 bg-black/5 px-3 text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="https://x.com/…" value={coin.links.x} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, x: e.target.value } })} />)}
                {field("Telegram · optional", <input data-testid="launch-telegram" className="h-10 w-full rounded-[3px] border border-black/10 bg-black/5 px-3 text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" placeholder="https://t.me/…" value={coin.links.telegram} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, telegram: e.target.value } })} />)}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6" data-testid="launch-step-devbuy">
              <h2 className="text-xl font-medium text-[#131a0f]">Opening buy</h2>
              <p className="text-[13px] font-light text-[#5c6b50]">Grab your own coin inside the mint transaction, ahead of the crowd. Zero means everyone gets the same open.</p>
              {field("Opening buy (SOL)",
                <input data-testid="launch-devbuy" type="number" min={0} step={0.1} value={devBuySol} onChange={(e) => setDevBuySol(Number(e.target.value) || 0)}
                  className="h-11 w-56 rounded-[3px] border border-black/10 bg-black/5 px-3.5 font-mono text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40" />)}
              <div className="flex gap-2">
                {[0, 0.1, 0.5, 1, 2].map((v) => (
                  <button key={v} data-testid={`devbuy-preset-${v}`} onClick={() => setDevBuySol(v)}
                    className={`rounded-[3px] px-4 py-1.5 font-mono text-xs ${devBuySol === v ? "bg-[#3F9E00] text-white" : "border border-black/10 text-[#5c6b50] hover:border-[#3F9E00]/40"}`}>
                    {v} SOL
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6" data-testid="launch-step-review">
              <h2 className="text-xl font-medium text-[#131a0f]">Review & launch</h2>
              {phase === "live" && liveMint ? (
                <Panel className="border-[#3F9E00]/30 bg-[#3F9E00]/5 p-6" data-testid="launch-success">
                  <div className="flex items-center gap-2 text-[#3F9E00]"><Check size={18} /><span className="font-medium">Your coin is on chain.</span></div>
                  <div className="mt-3 font-mono text-xs text-[#5c6b50] space-y-1.5">
                    <div className="flex items-center gap-2">Mint <ExtLink href={solscanAcct(liveMint)}>{short(liveMint, 6, 6)}</ExtLink></div>
                    {liveSig && <div className="flex items-center gap-2">Tx <ExtLink href={solscanTx(liveSig)}>{short(liveSig, 6, 6)}</ExtLink></div>}
                  </div>
                  <p className="mt-3 text-[13px] font-light text-[#5c6b50]">Now give it a market maker — one deposit and it trades the dips and rips on its own.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link to={`/mm?mint=${liveMint}`} className="inline-flex items-center gap-2 rounded-[3px] bg-[#3F9E00] px-5 py-2 text-sm font-medium text-white hover:bg-[#54C400]" data-testid="launch-add-maker">
                      <Zap size={14} /> Add its market maker
                    </Link>
                    <Link to="/explore" className="rounded-[3px] border border-black/15 px-5 py-2 text-sm text-[#131a0f]">Explore</Link>
                  </div>
                </Panel>
              ) : (
                <>
                  <Panel className="p-5">
                    <div className="flex items-center gap-4">
                      <CoinAvatar url={imagePreview || coin.imageUrl} name={coin.name} size={48} className="rounded-[3px]" />
                      <div>
                        <div className="text-[#131a0f] font-medium">{coin.name || "Unnamed coin"} <span className="text-[#93a184] font-mono text-xs">${coin.ticker || "TICKER"}</span></div>
                        <div className="font-mono text-[11px] text-[#93a184]">bonding curve · minted from this page</div>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2 border-t border-black/5 pt-4 text-[12px] font-light text-[#5c6b50] list-none">
                      <li>1. Mints the coin on the bonding curve.</li>
                      <li>{devBuySol > 0 ? `2. Buys ${devBuySol} SOL of your coin inside the same transaction.` : "2. No opening buy — everyone gets the same open."}</li>
                      <li>3. One wallet approval, that's the whole launch.</li>
                    </ul>
                  </Panel>
                  {err && <Panel className="border-[#ff4d4f]/30 bg-[#ff4d4f]/5 p-4 text-[13px] text-[#d43d3d]" data-testid="launch-error">{err}</Panel>}
                  <button onClick={launch} disabled={phase !== "idle" && phase !== "failed"} data-testid="launch-sign-btn"
                    className="inline-flex h-12 items-center gap-2 rounded-[3px] bg-[#3F9E00] px-8 text-sm font-medium text-white hover:bg-[#54C400] hover:shadow-[0_0_28px_rgba(92,225,0,0.35)] disabled:opacity-50 transition-all">
                    <Rocket size={16} />
                    {phase === "idle" || phase === "failed" ? (connected ? "Approve & launch" : "Connect wallet to launch") : phase === "signing" ? "Approve in your wallet…" : phase === "sending" ? "Minting on chain…" : "Working…"}
                  </button>
                  <p className="text-[11px] font-light text-[#93a184]">Market making can lose money. Nothing moves until your wallet approves.</p>
                </>
              )}
            </div>
          )}

          {step < 2 && (
            <div className="mt-10 flex items-center gap-3">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} data-testid="launch-back-btn"
                  className="inline-flex h-10 items-center gap-1.5 rounded-[3px] border border-black/15 px-5 text-sm text-[#131a0f] hover:border-[#3F9E00]/40">
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              <button onClick={() => setStep(step + 1)} disabled={!stepOk[step]} data-testid="launch-next-btn"
                className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-[#3F9E00] px-6 text-sm font-medium text-white hover:bg-[#54C400] disabled:opacity-40">
                Next <ArrowRight size={14} />
              </button>
              {!stepOk[step] && step === 0 && <span className="font-mono text-[11px] text-[#93a184]">name, ticker and image required</span>}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 self-start" data-testid="launch-summary">
          <Panel className="p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#93a184]">What your wallet approves</div>
            <div className="mt-4 flex items-center gap-3">
              <CoinAvatar url={imagePreview || coin.imageUrl} name={coin.name} size={36} />
              <div>
                <div className="text-[#131a0f] text-sm">{coin.name || "Unnamed coin"}</div>
                <div className="font-mono text-[11px] text-[#93a184]">${coin.ticker || "TICKER"}</div>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 border-t border-black/5 pt-4 font-mono text-[12px]">
              <div className="flex justify-between"><dt className="text-[#93a184]">Opening buy</dt><dd className="text-[#131a0f] tnum">{devBuySol > 0 ? `${devBuySol} SOL` : "None"}</dd></div>
              <div className="flex justify-between"><dt className="text-[#93a184]">Signatures</dt><dd className="text-[#131a0f] tnum">1</dd></div>
              <div className="flex justify-between"><dt className="text-[#93a184]">Creator fees</dt><dd className="text-[#3F9E00] tnum">100% to you</dd></div>
              <div className="flex justify-between"><dt className="text-[#93a184]">Market maker</dt><dd className="text-[#131a0f]">add right after</dd></div>
            </dl>
            <p className="mt-4 border-t border-black/5 pt-3 text-[10px] font-light leading-relaxed text-[#93a184]">
              Market making can lose money. Nothing moves until your wallet approves.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
