import React from "react";

// Settings model: API keys stay identical to upstream, but grouping, order,
// labels and presentation are our own design.
export const SETTING_GROUPS = [
  {
    id: "dip",
    title: "Dip buying",
    blurb: "How deep a dip must go before it buys, and how hard it buys.",
    fields: [
      { key: "buyTriggerPct", label: "Dip depth", unit: "%", kind: "pct", min: 1, max: 50, help: "Price must fall this far under the reference before a buy." },
      { key: "buyIntensityPct", label: "Size per buy", unit: "%", kind: "pct", min: 1, max: 100, help: "Share of deployable capital spent on each buy." },
      { key: "averageDown", label: "Keep buying deeper dips", kind: "bool", help: "Buy again if it keeps falling after the first buy." },
      { key: "buyCapitalPct", label: "Max share of capital in one position", unit: "%", kind: "pct-null", min: 1, max: 100 },
      { key: "deepAfterPct", label: "Deep-dip threshold", unit: "%", kind: "pct-null", min: 5, max: 90 },
      { key: "deepStepPct", label: "Deep-dip step", unit: "%", kind: "pct-null", min: 1, max: 50 },
      { key: "stepDown", label: "Scale down with depth", kind: "bool-null" },
    ],
  },
  {
    id: "profit",
    title: "Taking profit",
    blurb: "When it sells, how much it sells, and where it lets winners run.",
    fields: [
      { key: "sellTriggerPct", label: "Rise to sell", unit: "%", kind: "pct", min: 1, max: 100, help: "Price must rise this far over entry before a sell." },
      { key: "sellIntensityPct", label: "Size per sell", unit: "%", kind: "pct", min: 1, max: 100, help: "Share of the position sold on each rise." },
      { key: "profitTargetPct", label: "Round-trip target", unit: "%", kind: "pct", min: 1, max: 50, help: "Profit counted toward payouts once a round trip clears this." },
      { key: "trailingStopPct", label: "Trail the peak", unit: "%", kind: "pct-null", min: 1, max: 60, help: "Sell if price falls this far from its peak. Off keeps holding." },
    ],
  },
  {
    id: "guard",
    title: "Protection",
    blurb: "Where it cuts losses and what it refuses to touch.",
    fields: [
      { key: "stopLossPct", label: "Bail-out", unit: "%", kind: "pct-null", min: 5, max: 90, help: "Sells the position if it falls this far under entry. Off rides it out." },
      { key: "stopFromFirstBuy", label: "Measure bail-out from first buy", kind: "bool" },
      { key: "trendFilter", label: "Skip falling trends", kind: "bool", help: "No buys while the trend points down." },
      { key: "followMinutes", label: "Trend watch window", unit: "min", kind: "num-null", min: 1, max: 1440 },
      { key: "minMcapUsd", label: "No buys below market cap", unit: "$", kind: "num-null" },
      { key: "maxMcapUsd", label: "No buys above market cap", unit: "$", kind: "num-null" },
    ],
  },
  {
    id: "rhythm",
    title: "Rhythm & size",
    blurb: "How often it may act and how big each action can be.",
    fields: [
      { key: "cooldownSeconds", label: "Pause between trades", unit: "s", kind: "num", min: 0, max: 3600 },
      { key: "minTradeSol", label: "Smallest trade", unit: "SOL", kind: "sol", step: 0.01 },
      { key: "maxTradeSol", label: "Biggest trade", unit: "SOL", kind: "sol", step: 0.01 },
      { key: "slippageBps", label: "Slippage tolerance", unit: "bps", kind: "num", min: 100, max: 5000, step: 50 },
      { key: "maxExposureSol", label: "Max SOL in the coin", unit: "SOL", kind: "sol-null", step: 0.1 },
      { key: "dailySpendLimitSol", label: "Daily spend cap", unit: "SOL", kind: "sol-null", step: 0.1 },
    ],
  },
  {
    id: "capital",
    title: "Wallets & capital",
    blurb: "How many wallets trade and how the treasury splits its SOL.",
    fields: [
      { key: "walletCount", label: "Trading wallets", unit: "", kind: "num", min: 1, max: 10 },
      { key: "solRatioPct", label: "SOL kept liquid", unit: "%", kind: "pct", min: 0, max: 100 },
      { key: "reserveSol", label: "Always keep in treasury", unit: "SOL", kind: "sol", step: 0.01 },
      { key: "allocationSol", label: "Per-wallet allocation", unit: "SOL", kind: "sol-null", step: 0.05 },
    ],
  },
  {
    id: "payout",
    title: "Your payouts",
    blurb: "What stays in the maker and what flows to you.",
    fields: [
      { key: "rewardsToMmPct", label: "Rewards kept by the maker", unit: "%", kind: "pct", min: 0, max: 100, help: "The rest of each claim is payable to you." },
      { key: "reinvestPct", label: "Profits reinvested", unit: "%", kind: "pct", min: 0, max: 100 },
      { key: "autoPayout", label: "Pay out automatically", kind: "bool" },
      { key: "payoutMinSol", label: "Auto payout from", unit: "SOL", kind: "sol", step: 0.01 },
      { key: "closeAtProfitSol", label: "Retire the maker at profit", unit: "SOL", kind: "sol-null", step: 0.5 },
    ],
  },
];

const fieldByKey = (k) => {
  for (const g of SETTING_GROUPS) for (const f of g.fields) if (f.key === k) return f;
  return null;
};

// Every adjustable key the upstream supports, minus walletOverrides (advanced JSON).
export const PAYOUT_KEYS = SETTING_GROUPS.find((g) => g.id === "payout").fields.map((f) => f.key);
export const NON_PAYOUT_KEYS = SETTING_GROUPS.filter((g) => g.id !== "payout").flatMap((g) => g.fields.map((f) => f.key));
export const ALL_SETTING_KEYS = [...NON_PAYOUT_KEYS, ...PAYOUT_KEYS];

const prettyLabel = (k) =>
  k.replace(/Pct$/, " %").replace(/Sol$/, " SOL").replace(/Seconds$/, " s").replace(/Bps$/, " bps")
    .replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

/* ---------- controls ---------- */

const Toggle = ({ checked, onChange, testId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!checked}
    data-testid={testId}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 rounded-[3px] transition-colors ${checked ? "bg-[#3F9E00]" : "bg-black/10 border border-black/15"}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-[3px] bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
  </button>
);

const PctSlider = ({ value, onChange, min = 0, max = 100, nullable, testId }) => {
  const off = value === null || value === undefined;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} disabled={off}
        value={off ? min : value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="flex-1 accent-[#3F9E00] disabled:opacity-30"
      />
      <span className={`w-16 text-right font-mono text-xs tnum ${off ? "text-[#93a184]" : "text-[#131a0f]"}`}>
        {off ? "off" : `${value}%`}
      </span>
      {nullable && (
        <button type="button" onClick={() => onChange(off ? min : null)} data-testid={`${testId}-toggle`}
          className={`rounded-[3px] border px-2 py-0.5 font-mono text-[10px] uppercase ${off ? "border-black/15 text-[#5c6b50]" : "border-[#3F9E00]/40 text-[#3F9E00]"}`}>
          {off ? "set" : "off"}
        </button>
      )}
    </div>
  );
};

const NumInput = ({ value, onChange, unit, step = 1, min, nullable, testId }) => {
  const off = nullable && (value === null || value === undefined);
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          type="number" step={step} min={min} disabled={off}
          value={off ? "" : value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))}
          data-testid={testId}
          placeholder={off ? "off" : ""}
          className="h-9 w-full rounded-lg border border-black/10 bg-black/5 px-3 pr-12 font-mono text-sm text-[#131a0f] outline-none focus:border-[#3F9E00]/40 disabled:opacity-40"
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase text-[#93a184]">{unit}</span>}
      </div>
      {nullable && (
        <button type="button" onClick={() => onChange(off ? 0 : null)} data-testid={`${testId}-toggle`}
          className={`rounded-[3px] border px-2 py-1 font-mono text-[10px] uppercase ${off ? "border-black/15 text-[#5c6b50]" : "border-[#3F9E00]/40 text-[#3F9E00]"}`}>
          {off ? "set" : "off"}
        </button>
      )}
    </div>
  );
};

const FieldControl = ({ field, value, onChange }) => {
  const t = `set-${field.key}`;
  switch (field.kind) {
    case "bool":
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-[#5c6b50]">{value ? "on" : "off"}</span>
          <Toggle checked={!!value} onChange={onChange} testId={t} />
        </div>
      );
    case "bool-null":
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-[#5c6b50]">{value === null || value === undefined ? "off" : value ? "on" : "off"}</span>
          <Toggle checked={!!value} onChange={onChange} testId={t} />
        </div>
      );
    case "pct":
      return <PctSlider value={value ?? field.min} min={field.min} max={field.max} onChange={onChange} testId={t} />;
    case "pct-null":
      return <PctSlider value={value} min={field.min} max={field.max} onChange={onChange} nullable testId={t} />;
    case "sol":
      return <NumInput value={value} unit="SOL" step={field.step || 0.01} onChange={onChange} testId={t} />;
    case "sol-null":
      return <NumInput value={value} unit="SOL" step={field.step || 0.1} onChange={onChange} nullable testId={t} />;
    case "num-null":
      return <NumInput value={value} unit={field.unit} step={field.step || 1} min={field.min} onChange={onChange} nullable testId={t} />;
    default:
      return <NumInput value={value} unit={field.unit} step={field.step || 1} min={field.min} onChange={onChange} testId={t} />;
  }
};

/* ---------- editable editor ---------- */

export function SettingsEditor({ values, onChange, compactKeys }) {
  const [open, setOpen] = React.useState({ dip: true, profit: true, guard: false, rhythm: false, capital: false, payout: true });
  return (
    <div className="space-y-4" data-testid="settings-editor">
      {SETTING_GROUPS.map((g) => {
        const fields = compactKeys ? g.fields.filter((f) => compactKeys.includes(f.key)) : g.fields;
        if (!fields.length) return null;
        const isOpen = open[g.id];
        const activeCount = fields.filter((f) => values[f.key] !== null && values[f.key] !== undefined && values[f.key] !== false).length;
        return (
          <div key={g.id} className="rounded-xl border border-black/10 bg-black/[0.03] overflow-hidden" data-testid={`group-${g.id}`}>
            <button type="button" onClick={() => setOpen({ ...open, [g.id]: !isOpen })} data-testid={`group-toggle-${g.id}`}
              className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-black/[0.03] transition-colors">
              <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${isOpen ? "text-[#3F9E00]" : "text-[#93a184]"}`}>{g.title}</span>
              <span className="text-[11px] font-light text-[#93a184] hidden sm:inline">{g.blurb}</span>
              <span className="ml-auto rounded-[3px] border border-black/10 px-2 py-0.5 font-mono text-[10px] text-[#5c6b50]">{activeCount} set</span>
              <span className={`text-[#93a184] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <div className="border-t border-black/5 px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {fields.map((f) => (
                  <div key={f.key}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <label className="font-mono text-[11px] text-[#3a4a33]">{f.label}{f.unit && f.kind !== "pct" && f.kind !== "pct-null" ? "" : ""}</label>
                    </div>
                    <FieldControl field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
                    {f.help && <p className="mt-1 text-[10px] font-light text-[#93a184]">{f.help}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- read-only summary ---------- */

const fmtVal = (f, v) => {
  if (v === null || v === undefined) return "off";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (f?.kind?.startsWith("pct") || (f?.unit === "%")) return `${v}%`;
  if (f?.unit === "SOL") return `${v} SOL`;
  if (f?.unit) return `${v}${f.unit}`;
  return String(v);
};

export function SettingsSummary({ settings }) {
  const s = settings || {};
  return (
    <div className="space-y-4" data-testid="settings-summary">
      {SETTING_GROUPS.map((g) => {
        const items = g.fields
          .filter((f) => s[f.key] !== undefined)
          .map((f) => [f.label, fmtVal(f, s[f.key])]);
        if (!items.length) return null;
        return (
          <div key={g.id}>
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#93a184]">{g.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {items.map(([label, val]) => (
                <span key={label} className={`rounded-[3px] border px-2.5 py-1 font-mono text-[10px] ${val === "off" ? "border-black/5 text-[#b7c4a9]" : "border-black/10 text-[#5c6b50]"}`}>
                  {label} <span className={val === "off" ? "" : "text-[#131a0f]"}>{val}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { fieldByKey, prettyLabel };
