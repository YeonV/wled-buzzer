import { useRef, useEffect } from "react";
import "./AnimatedAuraAvatar.css";

const COUNT = 300;

function parseColor(css) {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = css;
  const h = c.fillStyle;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function spawn(cx, cy, spread, stagger) {
  const roll = Math.random();

  if (roll < 0.08) {
    // Glow — large, slow, ambient fill
    return {
      x: cx + (Math.random() - 0.5) * spread * 0.5,
      y: cy + (Math.random() - 0.3) * spread * 0.3,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.2 + Math.random() * 0.4),
      life: stagger ? Math.random() * 80 : 0,
      maxLife: 60 + Math.random() * 40,
      size: 35 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      freq: 0.008 + Math.random() * 0.012,
      amp: 0.15 + Math.random() * 0.25,
      kind: 0, // glow
    };
  }

  if (roll < 0.18) {
    // Spark — small, fast, white-hot
    return {
      x: cx + (Math.random() - 0.5) * spread,
      y: cy + (Math.random() - 0.5) * spread * 0.3,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(3 + Math.random() * 3.5),
      life: stagger ? Math.random() * 25 : 0,
      maxLife: 18 + Math.random() * 22,
      size: 1.5 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      freq: 0.04 + Math.random() * 0.04,
      amp: 0.4 + Math.random() * 0.8,
      kind: 2, // spark
    };
  }

  // Fire — the bulk of particles
  return {
    x: cx + (Math.random() - 0.5) * spread,
    y: cy + (Math.random() - 0.3) * spread * 0.4,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -(1 + Math.random() * 2.2),
    life: stagger ? Math.random() * 55 : 0,
    maxLife: 30 + Math.random() * 45,
    size: 5 + Math.random() * 16,
    phase: Math.random() * Math.PI * 2,
    freq: 0.015 + Math.random() * 0.035,
    amp: 0.25 + Math.random() * 0.7,
    kind: 1, // fire
  };
}

export function AnimatedAuraAvatar({
  imageSrc  = null,
  children  = null,
  auraColor = "#39ff6a",
  size      = 320,
  alt       = "Avatar",
  className = "",
  imageInset = "10%",
}) {
  const hasSrc = Boolean(imageSrc);
  const canvasRef = useRef(null);
  const frontRef = useRef(null);
  const rafRef = useRef(0);
  const raf2Ref = useRef(0);

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

    // Canvas coordinate helpers.
    // CSS: left:-30% top:-120% = 160% wide × 225% tall of container.
    // Container center (50%,50%) → canvas ((30+50)/160, (120+50)/225) = (50%, 75.6%).
    const W  = () => canvas.width / dpr;
    const H  = () => canvas.height / dpr;
    const CX = () => W() * 0.5;
    const CY = () => H() * 0.935;
    const SP = () => W() * (100 / 160) * 0.45;

    const particles = [];
    for (let i = 0; i < COUNT; i++) particles.push(spawn(CX(), CY(), SP(), true));

    let t = 0;

    function frame() {
      t++;
      const cw = W(), ch = H(), cx = CX(), cy = CY(), sp = SP();
      ctx.clearRect(0, 0, cw, ch);

      // ── Additive blending: overlapping particles glow brighter ──
      ctx.globalCompositeOperation = "lighter";

      // Base ambient glow
      const pulse = 0.22 + 0.07 * Math.sin(t * 0.03);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sp * 1.6);
      bg.addColorStop(0, `rgba(${R},${G},${B},${pulse})`);
      bg.addColorStop(0.5, `rgba(${R},${G},${B},${pulse * 0.25})`);
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      // ── Particles ──
      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];
        p.life++;

        if (p.life >= p.maxLife) {
          Object.assign(p, spawn(cx, cy, sp, false));
          continue;
        }

        const prog = p.life / p.maxLife;

        // Physics
        p.x += p.vx + Math.sin(p.phase + t * p.freq) * p.amp;
        p.y += p.vy;
        if (p.kind === 1) p.vy -= 0.012; // fire: slight upward accel
        if (p.kind === 2) p.vy -= 0.025; // spark: stronger accel

        // Size curve
        let sz;
        if (p.kind === 2) {
          sz = p.size * (1 - prog);
        } else {
          const grow   = prog < 0.12 ? prog / 0.12 : 1;
          const shrink = prog > 0.4  ? 1 - (prog - 0.4) / 0.6 : 1;
          sz = p.size * grow * shrink;
        }
        if (sz < 0.3) continue;

        // Alpha curve
        let a;
        if (p.kind === 0) {
          // glow: very transparent
          a = (prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8) * 0.12;
        } else if (p.kind === 2) {
          // spark: pop in, fade out
          a = prog < 0.08 ? prog / 0.08 : 1 - prog;
        } else {
          // fire: quick appear, slow fade
          a = (prog < 0.06 ? prog / 0.06 : 1 - Math.pow(prog, 1.4)) * 0.65;
        }
        if (a <= 0.005) continue;

        // Color: white → auraColor as particle ages
        const ct = Math.min(prog * 2.5, 1);
        const cr = 255 + (R - 255) * ct | 0;
        const cg = 255 + (G - 255) * ct | 0;
        const cb = 255 + (B - 255) * ct | 0;

        // Draw: soft radial gradient circle
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
        g.addColorStop(0,    `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.35, `rgba(${R},${G},${B},${a * 0.45})`);
        g.addColorStop(1,    "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      }

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); obs.disconnect(); };
  }, [auraColor]);

  // ── Front layer: sparse sparks floating over the image ──
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
    const FRONT_COUNT = 20;
    const particles = [];

    function spawnFront(stagger) {
      const w = W(), h = H();
      const cx = w * 0.5;
      const cy = h * 0.92;
      const spread = w * 0.5;
      const roll = Math.random();

      if (roll < 0.6) {
        // Spark — small, bright, fast
        return {
          x: cx + (Math.random() - 0.5) * spread,
          y: cy + Math.random() * h * 0.08,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(1.5 + Math.random() * 3),
          life: stagger ? Math.random() * 40 : 0,
          maxLife: 30 + Math.random() * 40,
          size: 1.5 + Math.random() * 3,
          phase: Math.random() * Math.PI * 2,
          freq: 0.03 + Math.random() * 0.04,
          amp: 0.3 + Math.random() * 0.6,
          kind: 2,
        };
      }
      // Fire wisp — medium, translucent
      return {
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + Math.random() * h * 0.08,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.8 + Math.random() * 1.8),
        life: stagger ? Math.random() * 50 : 0,
        maxLife: 35 + Math.random() * 45,
        size: 4 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        freq: 0.015 + Math.random() * 0.03,
        amp: 0.2 + Math.random() * 0.5,
        kind: 1,
      };
    }

    for (let i = 0; i < FRONT_COUNT; i++) particles.push(spawnFront(true));

    let t = 0;
    function frame() {
      t++;
      const cw = W(), ch = H();
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < FRONT_COUNT; i++) {
        const p = particles[i];
        p.life++;
        if (p.life >= p.maxLife) { Object.assign(p, spawnFront(false)); continue; }

        const prog = p.life / p.maxLife;
        p.x += p.vx + Math.sin(p.phase + t * p.freq) * p.amp;
        p.y += p.vy;
        if (p.kind === 2) p.vy -= 0.015;

        const sz = p.kind === 2
          ? p.size * (1 - prog)
          : p.size * (prog < 0.1 ? prog / 0.1 : 1) * (prog > 0.4 ? 1 - (prog - 0.4) / 0.6 : 1);
        if (sz < 0.3) continue;

        let a = p.kind === 2
          ? (prog < 0.08 ? prog / 0.08 : 1 - prog)
          : (prog < 0.06 ? prog / 0.06 : 1 - Math.pow(prog, 1.4)) * 0.45;
        if (a <= 0.005) continue;

        const ct = Math.min(prog * 2.5, 1);
        const cr = 255 + (R - 255) * ct | 0;
        const cg = 255 + (G - 255) * ct | 0;
        const cb = 255 + (B - 255) * ct | 0;

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
        g.addColorStop(0,    `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(0.35, `rgba(${R},${G},${B},${a * 0.4})`);
        g.addColorStop(1,    "rgba(0,0,0,0)");
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
    <div
      className={className}
      style={{
        position:    "relative",
        width:       typeof size === "number" ? `${size}px` : size,
        height:      typeof size === "number" ? `${size}px` : size,
        flexShrink:  0,
        display:     "inline-block",
        overflow:    "visible",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position:     "absolute",
          left:         "-30%",
          top:          "-200%",
          width:        "160%",
          height:       "305%",
          zIndex:       0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position:       "absolute",
          inset:          imageInset,
          zIndex:         2,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}
      >
        {hasSrc ? (
          <img
            src={imageSrc}
            alt={alt}
            draggable={false}
            onError={(e) => { e.target.style.display = "none"; }}
            style={{
              width:      "100%",
              height:     "100%",
              objectFit:  "contain",
              display:    "block",
              userSelect: "none",
            }}
          />
        ) : (
          children
        )}
      </div>
      <canvas
        ref={frontRef}
        style={{
          position:      "absolute",
          inset:         "0%",
          width:         "100%",
          height:        "100%",
          zIndex:        3,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
