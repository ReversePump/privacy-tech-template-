import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Upload, Rocket, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { makers, errorMessage } from "../lib/api";
import { b64ToBytes, bytesToB64, fmtSol, short } from "../lib/format";
import { PageHead, Panel, CoinAvatar } from "../components/bits";
import { SettingsEditor } from "../components/SettingsEditor";
import { useAuth } from "../solana/AuthContext";

const STEPS = ["Identity", "Opening buy", "Maker fuel", "Temperament", "Your payouts", "Review & launch"];

const DEFAULT_SETTINGS = {
  buyTriggerPct: 10, sellTriggerPct: 10, buyIntensityPct: 50, sellIntensityPct: 50,
  averageDown: true, cooldownSeconds: 180, profitTargetPct: 4, stopLossPct: 35,
  solRatioPct: 50, trailingStopPct: null, trendFilter: false,
};

export default function Launch() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { publicKey, connected, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { signedIn, signIn } = useAuth();

  const [config, setConfig] = useState(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle|uploading|creating|signing|sending|live|failed
  const [err, setErr] = useState(null);
  const [liveDesk, setLiveDesk] = useState(null);

  const [coin, setCoin] = useState({ name: "", ticker: "", description: "", imageUrl: null, links: { website: "", x: "", telegram: "" } });
  const [imageBlob, setImageBlob] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [devBuySol, setDevBuySol] = useState(0);
  const [fundSol, setFundSol] = useState(1);
  const [preset, setPreset] = useState("balanced");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [rewardsKeptPct, setRewardsKeptPct] = useState(50);
  const [payoutMinSol, setPayoutMinSol] = useState(0.1);
  const fileRef = useRef(null);

  useEffect(() => {
    makers.config().then((c) => {
      setConfig(c);
      if (c?.defaults) setSettings((s) => ({ ...s, ...c.defaults }));
    }).catch(() => {});
  }, []);

  const presets = config?.presets ? Object.entries(config.presets) : [];

  const pickPreset = (key) => {
    setPreset(key);
    const p = config?.presets?.[key];
    if (p?.values) setSettings((s) => ({ ...s, ...p.values }));
  };

  const onImage = async (file) => {
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error("Image must be under 1 MB"); return; }
    setImageBlob(file);
    setImagePreview((old) => { if (old?.startsWith("blob:")) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    setCoin((c) => ({ ...c, imageUrl: null }));
    setPhase("uploading");
    try {
      const { imageUrl } = await makers.uploadImage(file);
      setCoin((c) => ({ ...c, imageUrl }));
    } catch (e) {
      toast.warning(`Image kept locally; it uploads when you prepare the launch. (${errorMessage(e)})`);
    } finally { setPhase("idle"); }
  };

  const byteLen = (s) => new TextEncoder().encode(s).length;
  const stepOk = useMemo(() => ([
    coin.name.trim().length > 0 && byteLen(coin.name) <= 32 && coin.ticker.trim().length > 0 && byteLen(coin.ticker) <= 13 && (coin.imageUrl || imageBlob),
    devBuySol >= 0,
    fundSol >= 0,
    true,
    rewardsKeptPct >= 0 && rewardsKeptPct <= 100 && payoutMinSol >= 0,
    true,
  ]), [coin, imageBlob, devBuySol, fundSol, rewardsKeptPct, payoutMinSol]);

  const settingsDiff = useMemo(() => {
    const base = { ...DEFAULT_SETTINGS, ...(config?.defaults || {}) };
    return Object.fromEntries(Object.entries(settings).filter(([k, v]) => v !== base[k] && v !== null && typeof v !== "object"));
  }, [settings, config]);

  const launch = async () => {
    if (!connected || !publicKey) { setVisible(true); return; }
    setErr(null);
    try {
      if (!signedIn) { try { await signIn(); } catch (e) { throw new Error(errorMessage(e)); } }

      let imageUrl = coin.imageUrl;
      if (!imageUrl && imageBlob) {
        setPhase("uploading");
        imageUrl = (await makers.uploadImage(imageBlob)).imageUrl;
        setCoin((c) => ({ ...c, imageUrl }));
      }
      if (!imageUrl) throw new Error("Add an image on the Coin step first.");

      setPhase("creating");
      const links = Object.fromEntries(Object.entries(coin.links).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const body = {
        name: coin.name.trim(),
        ticker: coin.ticker.trim(),
        description: coin.description.trim(),
        imageUrl,
        links,
        initialBuySol: devBuySol || 0,
        fundSol,
        settings: { ...settingsDiff, rewardsToMmPct: rewardsKeptPct, payoutMinSol },
      };
      let l = await makers.createLaunch(body);

      setPhase("signing");
      toast.info("Approve the launch in your wallet.");
      const fresh = await makers.prepareLaunch(l.desk.id);
      const unsigned = fresh.transaction || l.transaction;
      if (!unsigned) throw new Error("The API returned no transaction to sign.");
      const tx = VersionedTransaction.deserialize(b64ToBytes(unsigned));
      const signed = await signTransaction(tx);

      setPhase("sending");
      const res = await makers.submitLaunch(fresh.desk?.id || l.desk.id, bytesToB64(signed.serialize()));

      // fund the treasury separately when it does not fit in the launch tx
      const terms = fresh.terms || l.terms || {};
      if (terms.fundInLaunch === false && BigInt(terms.fundLamports || "0") > 0n) {
        try {
          const transfer = new Transaction().add(SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(terms.treasury),
            lamports: Number(BigInt(terms.fundLamports)),
          }));
          const sig = await sendTransaction(transfer, connection);
          toast.info(`Funding sent: ${short(sig)}`);
        } catch (e) {
          toast.warning(`Launch landed but the funding transfer was not sent: ${errorMessage(e)}`);
        }
      }

      setPhase("live");
      setLiveDesk(res?.desk || fresh.desk || l.desk);
      toast.success("Your coin is on chain.", { description: "The maker starts as soon as its treasury has SOL." });
    } catch (e) {
      setPhase("failed");
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    }
  };

  const field = (label, node, hint, testId) => (
    <div data-testid={testId}>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">{label}</label>
      {node}
      {hint && <p className="mt-1.5 text-[11px] font-light text-[#556b82]">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-8 pt-10 md:pt-14" data-testid="launch-page">
      <PageHead
        kicker="Launch"
        title="Mint a coin."
        accent="Wire the maker."
        sub="One approval mints the coin on pump.fun, locks its fee split and funds its market maker. Every dial stays yours afterwards. Market making can lose money."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-8">
        {/* steps rail */}
        <nav className="hidden lg:block" data-testid="launch-steps">
          <ol className="space-y-1 border-l border-white/10">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  data-testid={`launch-step-${i}`}
                  onClick={() => i < step && setStep(i)}
                  className={`-ml-px flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left text-[13px] transition-colors ${
                    i === step ? "border-[#8AF5D0] text-white" : i < step ? "border-transparent text-[#8AF5D0]" : "border-transparent text-[#556b82]"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-[3px] border font-mono text-[10px] ${i === step ? "border-[#8AF5D0] text-[#8AF5D0]" : i < step ? "border-[#8AF5D0]/40 bg-[#8AF5D0]/10 text-[#8AF5D0]" : "border-white/15"}`}>
                    {i < step ? <Check size={10} /> : i + 1}
                  </span>
                  {s}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* form */}
        <div className="min-w-0">
          {step === 0 && (
            <div className="space-y-6" data-testid="launch-step-coin">
              <h2 className="text-xl font-medium text-white">Identity</h2>
              <p className="text-[13px] font-light text-[#8ca3b8]">The face of your coin on pump.fun — name, ticker, artwork. It trades against SOL while its own fees power the maker.</p>
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
                <div>
                  <button onClick={() => fileRef.current?.click()} data-testid="launch-image-upload"
                    className="flex h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-[#8ca3b8] hover:border-[#8AF5D0]/40 hover:text-[#8AF5D0] transition-colors overflow-hidden">
                    {imagePreview ? <img src={imagePreview} alt="coin" className="h-full w-full object-cover" /> : (<><Upload size={20} /><span className="text-xs">Upload image</span><span className="text-[10px] text-[#556b82]">or drop it here</span></>)}
                  </button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                    onChange={(e) => onImage(e.target.files?.[0])} data-testid="launch-image-input" />
                  <p className="mt-2 text-[10px] font-light text-[#556b82]">PNG, JPEG, WEBP or GIF, up to 1 MB. Square works best.</p>
                </div>
                <div className="space-y-5">
                  {field(`Name · ${byteLen(coin.name)} / 32 bytes`,
                    <input data-testid="launch-name" className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="Coin name" value={coin.name} onChange={(e) => setCoin({ ...coin, name: e.target.value })} />)}
                  {field(`Ticker · ${byteLen(coin.ticker)} / 13 bytes`,
                    <input data-testid="launch-ticker" className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="$ TICKER" value={coin.ticker} onChange={(e) => setCoin({ ...coin, ticker: e.target.value.toUpperCase().replace(/\s/g, "") })} />)}
                </div>
              </div>
              <Panel className="border-[#8AF5D0]/20 bg-[#8AF5D0]/5 p-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8AF5D0]">Set in stone</span>
                <p className="mt-1 text-[12px] font-light text-[#8ca3b8]">Name, ticker and artwork are written into the coin itself at mint. No one edits them later — not even you.</p>
              </Panel>
              {field(`Description · optional · ${byteLen(coin.description)} / 1000`,
                <textarea data-testid="launch-description" rows={3} className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="What the coin is about, in a sentence or two." value={coin.description} onChange={(e) => setCoin({ ...coin, description: e.target.value })} />)}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {field("Website · optional", <input data-testid="launch-website" className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="https://" value={coin.links.website} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, website: e.target.value } })} />)}
                {field("X · optional", <input data-testid="launch-x" className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="https://x.com/…" value={coin.links.x} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, x: e.target.value } })} />)}
                {field("Telegram · optional", <input data-testid="launch-telegram" className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#8AF5D0]/40" placeholder="https://t.me/…" value={coin.links.telegram} onChange={(e) => setCoin({ ...coin, links: { ...coin.links, telegram: e.target.value } })} />)}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6" data-testid="launch-step-devbuy">
              <h2 className="text-xl font-medium text-white">Opening buy</h2>
              <p className="text-[13px] font-light text-[#8ca3b8]">Grab your own coin inside the mint transaction, ahead of the crowd. Zero means everyone gets the same open.</p>
              {field("Opening buy (SOL)",
                <input data-testid="launch-devbuy" type="number" min={0} step={0.1} value={devBuySol} onChange={(e) => setDevBuySol(Number(e.target.value) || 0)}
                  className="h-11 w-56 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />,
                "An opening buy leaves no room for fuel in the mint transaction, so your wallet signs twice: the mint, then a plain transfer to the maker's vault.")}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6" data-testid="launch-step-funding">
              <h2 className="text-xl font-medium text-white">Maker fuel</h2>
              <p className="text-[13px] font-light text-[#8ca3b8]">SOL wired into the maker's vault at mint. At zero, the market maker runs purely on the coin's own creator fees.</p>
              {field("Fuel the maker (SOL)",
                <input data-testid="launch-fund" type="number" min={0} step={0.1} value={fundSol} onChange={(e) => setFundSol(Number(e.target.value) || 0)}
                  className="h-11 w-56 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />)}
              <div className="flex gap-2">
                {[0, 0.5, 1, 2, 5].map((v) => (
                  <button key={v} data-testid={`fund-preset-${v}`} onClick={() => setFundSol(v)}
                    className={`rounded-[3px] px-4 py-1.5 font-mono text-xs ${fundSol === v ? "bg-[#8AF5D0] text-[#07111f]" : "border border-white/10 text-[#8ca3b8] hover:border-[#8AF5D0]/40"}`}>
                    {v} SOL
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6" data-testid="launch-step-strategy">
              <h2 className="text-xl font-medium text-white">Temperament</h2>
              <p className="text-[13px] font-light text-[#8ca3b8]">Choose how the market maker behaves out of the gate. Retune every dial later.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {presets.map(([key, p]) => (
                  <button key={key} data-testid={`preset-${key}`} onClick={() => pickPreset(key)}
                    className={`rounded-xl border p-4 text-left transition-colors ${preset === key ? "border-[#8AF5D0]/50 bg-[#8AF5D0]/5" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}>
                    <div className="text-white text-sm font-medium">{p.name}</div>
                    <p className="mt-1 text-[12px] font-light text-[#8ca3b8]">{p.summary}</p>
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">Fine-tune the maker</div>
                <SettingsEditor
                  values={settings}
                  compactKeys={["buyTriggerPct", "buyIntensityPct", "averageDown", "sellTriggerPct", "sellIntensityPct", "profitTargetPct", "stopLossPct", "cooldownSeconds"]}
                  onChange={(k, v) => { setPreset("custom"); setSettings({ ...settings, [k]: v }); }}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6" data-testid="launch-step-treasury">
              <h2 className="text-xl font-medium text-white">Your payouts</h2>
              <p className="text-[13px] font-light text-[#8ca3b8]">How much of each fee claim stays in the maker — and when the rest lands in your wallet.</p>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#556b82]">Fees the maker keeps · {rewardsKeptPct}%</label>
                <input type="range" min={0} max={100} value={rewardsKeptPct} data-testid="launch-rewards-range"
                  onChange={(e) => setRewardsKeptPct(Number(e.target.value))} className="w-full accent-[#8AF5D0]" />
                <div className="mt-1 flex justify-between font-mono text-[10px] text-[#556b82]">
                  <span>{rewardsKeptPct}% maker</span>
                  <span>{100 - rewardsKeptPct}% flows to you</span>
                </div>
              </div>
              {field("Auto payout above (SOL)",
                <input data-testid="launch-payoutmin" type="number" min={0.01} step={0.01} value={payoutMinSol} onChange={(e) => setPayoutMinSol(Number(e.target.value) || 0)}
                  className="h-11 w-56 rounded-lg border border-white/10 bg-white/5 px-3.5 font-mono text-sm text-white outline-none focus:border-[#8AF5D0]/40" />)}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6" data-testid="launch-step-review">
              <h2 className="text-xl font-medium text-white">Review & launch</h2>
              {phase === "live" && liveDesk ? (
                <Panel className="border-[#8AF5D0]/30 bg-[#8AF5D0]/5 p-6" data-testid="launch-success">
                  <div className="flex items-center gap-2 text-[#8AF5D0]"><Check size={18} /><span className="font-medium">Your coin is on chain.</span></div>
                  <p className="mt-2 text-[13px] font-light text-[#8ca3b8]">The market maker spins up the moment its vault holds SOL. Every fill shows on its page.</p>
                  <div className="mt-5 flex gap-3">
                    <Link to={`/desk/${liveDesk.id}`} className="rounded-[3px] bg-[#8AF5D0] px-5 py-2 text-sm font-medium text-[#07111f]" data-testid="launch-open-desk">Open the maker →</Link>
                    <Link to="/explore" className="rounded-[3px] border border-white/15 px-5 py-2 text-sm text-white">Explore</Link>
                  </div>
                </Panel>
              ) : (
                <>
                  <Panel className="p-5">
                    <div className="flex items-center gap-4">
                      <CoinAvatar url={imagePreview || coin.imageUrl} name={coin.name} size={48} className="rounded-xl" />
                      <div>
                        <div className="text-white font-medium">{coin.name || "Unnamed coin"} <span className="text-[#556b82] font-mono text-xs">${coin.ticker || "TICKER"}</span></div>
                        <div className="font-mono text-[11px] text-[#556b82]">SOL pair · its own maker</div>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2 border-t border-white/5 pt-4 text-[12px] font-light text-[#8ca3b8] list-none">
                      <li>1. Mints the coin on pump.fun.</li>
                      <li>2. Locks the fee split for good: 80% maker · 20% platform.</li>
                      <li>{devBuySol > 0 ? `3. Buys ${devBuySol} SOL of your coin inside the same transaction.` : "3. No opening buy — everyone gets the same open."}</li>
                      <li>{fundSol > 0 ? `4. Wires ${fundSol} SOL into the maker's vault.` : "4. Sends nothing to the vault — the maker lives off the coin's own fees."}</li>
                    </ul>
                  </Panel>
                  {err && <Panel className="border-[#ff4d4f]/30 bg-[#ff4d4f]/5 p-4 text-[13px] text-[#ff8a8a]" data-testid="launch-error">{err}</Panel>}
                  <button onClick={launch} disabled={phase !== "idle" && phase !== "failed"} data-testid="launch-sign-btn"
                    className="inline-flex h-12 items-center gap-2 rounded-[3px] bg-[#8AF5D0] px-8 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] hover:shadow-[0_0_28px_rgba(138,245,208,0.4)] disabled:opacity-50 transition-all">
                    <Rocket size={16} />
                    {phase === "idle" || phase === "failed" ? (connected ? "Approve & launch" : "Connect wallet to launch") : phase === "signing" ? "Approve in your wallet…" : phase === "sending" ? "Sending…" : "Working…"}
                  </button>
                  <p className="text-[11px] font-light text-[#556b82]">Trading can lose money. Nothing moves until your wallet approves.</p>
                </>
              )}
            </div>
          )}

          {step < 5 && (
            <div className="mt-10 flex items-center gap-3">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} data-testid="launch-back-btn"
                  className="inline-flex h-10 items-center gap-1.5 rounded-[3px] border border-white/15 px-5 text-sm text-white hover:border-[#8AF5D0]/40">
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              <button onClick={() => setStep(step + 1)} disabled={!stepOk[step]} data-testid="launch-next-btn"
                className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-[#8AF5D0] px-6 text-sm font-medium text-[#07111f] hover:bg-[#7CFFC8] disabled:opacity-40">
                Next <ArrowRight size={14} />
              </button>
              {!stepOk[step] && step === 0 && <span className="font-mono text-[11px] text-[#556b82]">name, ticker and image required</span>}
            </div>
          )}
        </div>

        {/* summary rail */}
        <aside className="lg:sticky lg:top-24 self-start" data-testid="launch-summary">
          <Panel className="p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#556b82]">What your wallet approves</div>
            <div className="mt-4 flex items-center gap-3">
              <CoinAvatar url={imagePreview || coin.imageUrl} name={coin.name} size={36} />
              <div>
                <div className="text-white text-sm">{coin.name || "Unnamed coin"}</div>
                <div className="font-mono text-[11px] text-[#556b82]">${coin.ticker || "TICKER"}</div>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 border-t border-white/5 pt-4 font-mono text-[12px]">
              <div className="flex justify-between"><dt className="text-[#556b82]">Opening buy</dt><dd className="text-white tnum">{devBuySol > 0 ? `${devBuySol} SOL` : "None"}</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Maker fuel</dt><dd className="text-white tnum">{fundSol} SOL</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Signatures</dt><dd className="text-white tnum">{devBuySol > 0 ? 2 : 1}</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Fee split</dt><dd className="text-[#8AF5D0] tnum">80% maker · 20% platform</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Temperament</dt><dd className="text-white capitalize">{preset}</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Fees kept</dt><dd className="text-white tnum">{rewardsKeptPct}% · {100 - rewardsKeptPct}% to you</dd></div>
              <div className="flex justify-between"><dt className="text-[#556b82]">Auto payout</dt><dd className="text-white tnum">On, above {payoutMinSol} SOL</dd></div>
            </dl>
            <p className="mt-4 border-t border-white/5 pt-3 text-[10px] font-light leading-relaxed text-[#556b82]">
              Market making can lose money. Nothing moves until your wallet approves.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
