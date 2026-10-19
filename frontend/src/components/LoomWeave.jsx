import React, { useEffect, useRef } from "react";

/**
 * Loom Kinetic Weave — signal threads sweep in from the periphery,
 * curve toward a focal execution node, glow, and dissolve into sparks.
 * Canvas, DPR-aware, honors prefers-reduced-motion.
 */
const COLORS = ["#a855f7", "#c084fc", "#e879f9", "#818cf8"];

export default function LoomWeave({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, raf = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * DPR; canvas.height = h * DPR;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const focus = () => ({ x: w * 0.62, y: h * 0.46 });
    const rnd = (a, b) => a + Math.random() * (b - a);

    const mkThread = (seeded = false) => {
      const edge = Math.floor(Math.random() * 3); // 0 left, 1 top, 2 bottom
      const o = edge === 0 ? { x: -30, y: rnd(0, h) } : edge === 1 ? { x: rnd(0, w), y: -30 } : { x: rnd(0, w), y: h + 30 };
      const f = focus();
      return {
        ox: o.x, oy: o.y,
        c1x: rnd(w * 0.15, w * 0.5), c1y: o.y + rnd(-h * 0.25, h * 0.25),
        c2x: rnd(w * 0.4, w * 0.7), c2y: f.y + rnd(-h * 0.4, h * 0.4),
        t: seeded ? Math.random() : 0,
        speed: rnd(0.0016, 0.0042),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        width: rnd(0.7, 1.7),
        wobble: rnd(0.4, 1.4),
        phase: rnd(0, Math.PI * 2),
      };
    };

    const THREADS = Array.from({ length: 42 }, () => mkThread(true));
    let sparks = [];
    let time = 0;

    const bez = (t, p0, p1, p2, p3) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    };

    const frame = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);
      const f = focus();
      const pulse = 1 + Math.sin(time * 2.2) * 0.25;

      // focal node halo
      const halo = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 90 * pulse);
      halo.addColorStop(0, "rgba(192,132,252,0.32)");
      halo.addColorStop(1, "rgba(192,132,252,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(f.x, f.y, 90 * pulse, 0, Math.PI * 2); ctx.fill();

      for (const th of THREADS) {
        th.t += th.speed;
        if (th.t >= 1) {
          for (let i = 0; i < 5; i++) {
            sparks.push({ x: f.x, y: f.y, vx: rnd(-1.6, 1.6), vy: rnd(-1.6, 1.6), life: 1, color: th.color });
          }
          Object.assign(th, mkThread());
          continue;
        }
        const sway = Math.sin(time * th.wobble + th.phase) * 14;
        const p0 = { x: th.ox, y: th.oy };
        const p1 = { x: th.c1x, y: th.c1y + sway };
        const p2 = { x: th.c2x, y: th.c2y - sway };
        const p3 = f;
        // draw the trailing segment of the curve
        const tail = Math.max(0, th.t - 0.38);
        ctx.beginPath();
        const STEPS = 26;
        for (let i = 0; i <= STEPS; i++) {
          const tt = tail + (th.t - tail) * (i / STEPS);
          const x = bez(tt, p0.x, p1.x, p2.x, p3.x);
          const y = bez(tt, p0.y, p1.y, p2.y, p3.y);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const headX = bez(th.t, p0.x, p1.x, p2.x, p3.x);
        const headY = bez(th.t, p0.y, p1.y, p2.y, p3.y);
        const grad = ctx.createLinearGradient(bez(tail, p0.x, p1.x, p2.x, p3.x), bez(tail, p0.y, p1.y, p2.y, p3.y), headX, headY);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, th.color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = th.width;
        ctx.shadowColor = th.color;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // head glow dot
        ctx.fillStyle = th.color;
        ctx.beginPath(); ctx.arc(headX, headY, th.width * 1.35, 0, Math.PI * 2); ctx.fill();
      }

      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        s.x += s.vx; s.y += s.vy; s.life -= 0.03;
        ctx.globalAlpha = Math.max(s.life, 0) * 0.8;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className={className} data-testid="loom-weave" aria-hidden="true" />;
}
