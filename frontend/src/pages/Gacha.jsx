import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BASE, local, money, packArt, timeAgo } from "../lib/api";
import { useAuth } from "../AuthContext";
import RipStage from "../components/RipStage";

const RARITIES = ["common", "uncommon", "rare", "epic"];
const ODDS_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };

function MachineCard({ m, line, onPull, onShowCards, expanded, pool }) {
  const recent = pool.find((h) => h.pack === m.name);
  return (
    <div className={`machine${expanded ? " sel" : ""}`} data-testid={`machine-${m.id}`}>
      {recent && <span className="recent">{money(recent.value)} · {timeAgo(recent.at)}</span>}
      <div className="art"><img src={packArt(m.price)} alt={`${m.name} pack`} loading="lazy" /></div>
      <div className="nm">{m.name}</div>
      <div className="ev">avg value {money(m.ev, 2)}</div>
      <div className="odds">Epic 1 in {Math.round(1 / (m.odds?.epic || 0.01))} · sell back {m.buyback}%</div>
      <button className="btn btn-primary btn-block" onClick={() => onPull(m)} data-testid={`pull-${m.id}`}>
        Pull {money(m.price)}
      </button>
      <button className="see" style={{ background: "none", border: 0 }} onClick={() => onShowCards(expanded ? null : m.id)} data-testid={`cards-${m.id}`}>
        {expanded ? "Hide the odds ↑" : "See the odds ↓"}
      </button>
      {expanded && (
        <div className="fadeup" style={{ marginTop: 12, textAlign: "left" }} data-testid={`odds-${m.id}`}>
          {RARITIES.map((r) => (
            <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "5px 2px", borderTop: "1px solid var(--line)", fontSize: 11.5 }}>
              <span className={`rchip ${r}`}>{r}</span>
              <span className="mono mute">{((m.odds?.[r] || 0) * 100).toFixed(1)}%</span>
              <span className="mono dim">{money(m.tiers?.[r]?.start)}–{money(m.tiers?.[r]?.end)}</span>
            </div>
          ))}
          <div className="dim" style={{ fontSize: 10.5, marginTop: 8 }}>{m.stock?.toLocaleString()} in stock · pull reveals a real graded slab</div>
        </div>
      )}
    </div>
  );
}

export default function Gacha() {
  const { user, token, refresh } = useAuth();
  const [gacha, setGacha] = useState(null);
  const [line, setLine] = useState("pokemon");
  const [expanded, setExpanded] = useState(null);
  const [rip, setRip] = useState(null); // { machine, promise }
  const [hits, setHits] = useState([]);

  useEffect(() => {
    fetch(`${BASE}/api/data/gacha.json`).then((r) => r.json()).then(setGacha).catch(() => {});
    const load = () => fetch(`${BASE}/api/gh/hits`).then((r) => r.json()).then((d) => setHits(d.hits || [])).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const lines = gacha?.lines || [];
  const cur = lines.find((l) => l.id === line);

  const doPull = (m) => {
    if (!user) {
      document.querySelector("[data-testid='nav-signin']")?.click();
      toast.info("Sign in first — practice credits are free");
      return;
    }
    if (user.balance < m.price) {
      toast.error(`This pack costs ${money(m.price)} — your balance is ${money(user.balance, 2)}. Top up on your dashboard.`);
      return;
    }
    const promise = local.post("/pull", { machine: m.id }, token).then((d) => {
      refresh();
      return { ...d.card, pullId: d.pullId, sellbackUsd: d.sellbackUsd, packPrice: m.price };
    }).catch((e) => {
      toast.error(e.message);
      return null;
    });
    setRip({ machine: m, promise });
  };

  const sellback = async () => {
    if (!rip?.result?.pullId) return;
    try {
      const d = await local.post(`/sellback/${rip.result.pullId}`, {}, token);
      toast.success(`Sold back for ${money(d.credited, 2)}`);
      refresh();
      setRip(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="fadeup" data-testid="gacha-page">
      <div className="eyebrow">Grail Break gacha</div>
      <h1 className="h1">Pull one pack, right now.</h1>
      <p className="mute" style={{ marginTop: 8 }}>
        {lines.reduce((n, l) => n + l.machines.length, 0)} machines live · one pack, one real graded slab. Keep it, ship it, or sell it back.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "18px 0 20px" }} data-testid="gacha-lines">
        {lines.map((l) => (
          <button key={l.id} className={`pill${line === l.id ? " on" : ""}`} onClick={() => setLine(l.id)} data-testid={`line-${l.id}`}>
            {l.name}
          </button>
        ))}
      </div>

      <div className="gmachines">
        {(cur?.machines || []).filter((m) => m.live !== false).map((m) => (
          <MachineCard key={m.id} m={m} line={line} pool={hits} expanded={expanded === m.id}
            onShowCards={setExpanded} onPull={doPull} />
        ))}
      </div>

      {rip && (
        <RipStage
          machine={rip.machine}
          packCode={rip.machine.twin || rip.machine.code}
          pullPromise={rip.promise.then((card) => {
            if (card) setRip((r) => ({ ...r, result: card }));
            return card;
          })}
          onSellback={rip.result ? sellback : null}
          onClose={() => setRip(null)}
        />
      )}
    </div>
  );
}
