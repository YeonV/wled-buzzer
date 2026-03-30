import { useRef, useEffect } from "react";

const COUNT = 300;
const FRONT_COUNT = 20;
// Reference canvas width the particle values were tuned for (185% of 128px avatar)
const REF_W = 237;

function parseColor(css) {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = css;
  const h = c.fillStyle;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function spawn(cx, cy, spread, stagger, s) {
  const roll = Math.random();
  if (roll < 0.08) {
    return { x: cx + (Math.random() - 0.5) * spread * 0.5, y: cy + (Math.random() - 0.3) * spread * 0.3, vx: (Math.random() - 0.5) * 0.15 * s, vy: -(0.2 + Math.random() * 0.4) * s, life: stagger ? Math.random() * 80 : 0, maxLife: 60 + Math.random() * 40, size: (35 + Math.random() * 50) * s, phase: Math.random() * Math.PI * 2, freq: 0.008 + Math.random() * 0.012, amp: (0.15 + Math.random() * 0.25) * s, kind: 0 };
  }
  if (roll < 0.18) {
    return { x: cx + (Math.random() - 0.5) * spread, y: cy + (Math.random() - 0.5) * spread * 0.3, vx: (Math.random() - 0.5) * 1.2 * s, vy: -(3 + Math.random() * 3.5) * s, life: stagger ? Math.random() * 25 : 0, maxLife: 18 + Math.random() * 22, size: (1.5 + Math.random() * 2.5) * s, phase: Math.random() * Math.PI * 2, freq: 0.04 + Math.random() * 0.04, amp: (0.4 + Math.random() * 0.8) * s, kind: 2 };
  }
  return { x: cx + (Math.random() - 0.5) * spread, y: cy + (Math.random() - 0.3) * spread * 0.4, vx: (Math.random() - 0.5) * 0.5 * s, vy: -(1 + Math.random() * 2.2) * s, life: stagger ? Math.random() * 55 : 0, maxLife: 30 + Math.random() * 45, size: (5 + Math.random() * 16) * s, phase: Math.random() * Math.PI * 2, freq: 0.015 + Math.random() * 0.035, amp: (0.25 + Math.random() * 0.7) * s, kind: 1 };
}

/**
 * Canvas-only aura effect. Renders a back canvas (particles + ambient glow)
 * and a front canvas (sparse sparks). Both are absolutely positioned and
 * pointer-events: none, so they layer over/under sibling content without
 * affecting layout.
 */
export default function AuraCanvases({ auraColor = "#39ff6a" }) {
  const canvasRef = useRef(null);
  const frontRef = useRef(null);
  const rafRef = useRef(0);
  const raf2Ref = useRef(0);

  // ── Back canvas: ambient glow + particles ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const [R, G, B] = parseColor(auraColor);
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    const W  = () => canvas.width / dpr;
    const H  = () => canvas.height / dpr;
    const CX = () => W() * 0.5;
    const CY = () => H() * 0.935;
    const SP = () => W() * (100 / 160) * 0.45;
    const S  = () => W() / REF_W;

    const particles = [];
    for (let i = 0; i < COUNT; i++) particles.push(spawn(CX(), CY(), SP(), true, S()));

    let t = 0;
    function frame() {
      t++;
      const cw = W(), ch = H(), cx = CX(), cy = CY(), sp = SP(), s = S();
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "lighter";

      const pulse = 0.22 + 0.07 * Math.sin(t * 0.03);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sp * 1.6);
      bg.addColorStop(0, `rgba(${R},${G},${B},${pulse})`);
      bg.addColorStop(0.5, `rgba(${R},${G},${B},${pulse * 0.25})`);
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];
        p.life++;
        if (p.life >= p.maxLife) { Object.assign(p, spawn(cx, cy, sp, false, s)); continue; }
        const prog = p.life / p.maxLife;
        p.x += p.vx + Math.sin(p.phase + t * p.freq) * p.amp;
        p.y += p.vy;
        if (p.kind === 1) p.vy -= 0.012 * s;
        if (p.kind === 2) p.vy -= 0.025 * s;
        let sz;
        if (p.kind === 2) { sz = p.size * (1 - prog); }
        else { const grow = prog < 0.12 ? prog / 0.12 : 1; const shrink = prog > 0.4 ? 1 - (prog - 0.4) / 0.6 : 1; sz = p.size * grow * shrink; }
        if (sz < 0.3) continue;
        let a;
        if (p.kind === 0) a = (prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8) * 0.12;
        else if (p.kind === 2) a = prog < 0.08 ? prog / 0.08 : 1 - prog;
        else a = (prog < 0.06 ? prog / 0.06 : 1 - Math.pow(prog, 1.4)) * 0.65;
        if (a <= 0.005) continue;
        const ct = Math.min(prog * 2.5, 1);
        const cr = 255 + (R - 255) * ct | 0;
        const cg = 255 + (G - 255) * ct | 0;
        const cb = 255 + (B - 255) * ct | 0;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.35, `rgba(${R},${G},${B},${a * 0.45})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); obs.disconnect(); };
  }, [auraColor]);

  // ── Front canvas: sparse sparks ──
  useEffect(() => {
    const canvas = frontRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const [R, G, B] = parseColor(auraColor);
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;
    // Front canvas reference: 125% of 128px = 160px
    const SF = () => W() / 160;

    function spawnFront(stagger, s) {
      const w = W(), h = H(), cx = w * 0.5, cy = h * 0.92, spread = w * 0.5;
      const roll = Math.random();
      if (roll < 0.6) {
        return { x: cx + (Math.random() - 0.5) * spread, y: cy + Math.random() * h * 0.08, vx: (Math.random() - 0.5) * 0.8 * s, vy: -(1.5 + Math.random() * 3) * s, life: stagger ? Math.random() * 40 : 0, maxLife: 30 + Math.random() * 40, size: (1.5 + Math.random() * 3) * s, phase: Math.random() * Math.PI * 2, freq: 0.03 + Math.random() * 0.04, amp: (0.3 + Math.random() * 0.6) * s, kind: 2 };
      }
      return { x: cx + (Math.random() - 0.5) * spread, y: cy + Math.random() * h * 0.08, vx: (Math.random() - 0.5) * 0.4 * s, vy: -(0.8 + Math.random() * 1.8) * s, life: stagger ? Math.random() * 50 : 0, maxLife: 35 + Math.random() * 45, size: (4 + Math.random() * 10) * s, phase: Math.random() * Math.PI * 2, freq: 0.015 + Math.random() * 0.03, amp: (0.2 + Math.random() * 0.5) * s, kind: 1 };
    }

    const particles = [];
    for (let i = 0; i < FRONT_COUNT; i++) particles.push(spawnFront(true, SF()));

    let t = 0;
    function frame() {
      t++;
      const cw = W(), ch = H(), s = SF();
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < FRONT_COUNT; i++) {
        const p = particles[i];
        p.life++;
        if (p.life >= p.maxLife) { Object.assign(p, spawnFront(false, s)); continue; }
        const prog = p.life / p.maxLife;
        p.x += p.vx + Math.sin(p.phase + t * p.freq) * p.amp;
        p.y += p.vy;
        if (p.kind === 2) p.vy -= 0.015 * s;
        const sz = p.kind === 2 ? p.size * (1 - prog) : p.size * (prog < 0.1 ? prog / 0.1 : 1) * (prog > 0.4 ? 1 - (prog - 0.4) / 0.6 : 1);
        if (sz < 0.3) continue;
        let a = p.kind === 2 ? (prog < 0.08 ? prog / 0.08 : 1 - prog) : (prog < 0.06 ? prog / 0.06 : 1 - Math.pow(prog, 1.4)) * 0.45;
        if (a <= 0.005) continue;
        const ct = Math.min(prog * 2.5, 1);
        const cr = 255 + (R - 255) * ct | 0;
        const cg = 255 + (G - 255) * ct | 0;
        const cb = 255 + (B - 255) * ct | 0;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.35, `rgba(${R},${G},${B},${a * 0.4})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      raf2Ref.current = requestAnimationFrame(frame);
    }
    raf2Ref.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf2Ref.current); obs.disconnect(); };
  }, [auraColor]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: "-42.5%",
          top: "-252.5%",
          width: "185%",
          height: "356%",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={frontRef}
        style={{
          position: "absolute",
          left: "-12.5%",
          top: "-27.5%",
          width: "125%",
          height: "125%",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
