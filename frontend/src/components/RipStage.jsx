import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE, money } from "../lib/api";

/**
 * The rip stage — the reference site's own reveal engine (vendor/rip.js + rip.css),
 * driven solo: clip plays, sealed pack holds until our pull API answers, then the
 * light climbs to the card's true tier and the slab flips over with a price count-up.
 */
export default function RipStage({ machine, packCode, pullPromise, onResult, onSellback, onClose }) {
  const ref = useRef(null);
  const stageRef = useRef(null);
  const [result, setResult] = useState(null);
  const [sellBusy, setSellBusy] = useState(false);

  useEffect(() => {
    if (!window.GrailRip) return;
    // Browsers without H.264/MP3 codec support get open-codec variants of the same clips.
    const noH264 = !document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"');
    const noMp3 = !document.createElement("audio").canPlayType("audio/mpeg");
    const cleanups = [];
    if (noMp3) {
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (typeof input === "string") input = input.replace(/(\/api\/rip\/sfx\/[^?]+)\.mp3(\?|$)/, "$1.ogg$2");
        return realFetch(input, init);
      };
      cleanups.push(() => { window.fetch = realFetch; });
    }
    if (noH264) {
      const swap = () => ref.current && ref.current.querySelectorAll("video").forEach((vid) => {
        const src = vid.getAttribute("src") || "";
        if (src.includes("/api/rip/clips/") && src.endsWith(".mp4")) {
          vid.src = src.replace(/\.mp4(\?|$)/, ".webm$1");
          vid.load();
        }
      });
      const mo = new MutationObserver(swap);
      mo.observe(ref.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
      cleanups.push(() => mo.disconnect());
    }
    const stage = window.GrailRip.create(ref.current, {
      solo: true,
      root: `${BASE}/api/`,
      onLand(entry, tier) {
        Promise.resolve(entry.card).then((card) => setResult(card ? { card, tier } : { card: null }));
      },
    });
    stageRef.current = stage;
    const pack = { code: packCode, price: machine.price, name: machine.name };
    try { stage.preload(pack); } catch { /* clip optional */ }
    stage.reveal({ i: 0, pack, card: pullPromise });
    return () => {
      cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
      try { stage.reset(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="ripwrap" data-testid="rip-stage">
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <button className="btn rs-close" onClick={onClose} data-testid="rip-close">Close ✕</button>
      {result && (
        <div className="ripresult fadeup" data-testid="rip-result">
          {result.card ? (
            <>
              <span className="panel mono" style={{ padding: "10px 16px", fontSize: 13 }} data-testid="rip-card-value">
                {result.card.name} · <span className="green">{money(result.card.value)}</span>
                <span className={`rchip ${result.tier || "common"}`} style={{ marginLeft: 8 }}>{result.tier}</span>
              </span>
              {onSellback && (
                <button className="btn btn-gold" disabled={sellBusy} data-testid="rip-sellback"
                  onClick={async () => { setSellBusy(true); await onSellback(); setSellBusy(false); }}>
                  {sellBusy ? "Selling…" : "Sell back"}
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose} data-testid="rip-keep">Keep it</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onClose} data-testid="rip-done">Done</button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
