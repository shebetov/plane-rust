/**
 * Dust floating through the main-menu scene, drawn on a canvas. Each mote has its own depth:
 * near ones are bigger, softer and faster, far ones are fine specks. They ride a light wind
 * with a lazy sway and twinkle as they catch the light. Pauses while the tab is hidden.
 * Kept light: motes are stamped from two pre-drawn glow sprites, at 30 frames a second, on
 * a canvas at CSS-pixel size (the glows are soft, so extra resolution adds nothing).
 */
import { useEffect, useRef } from "react";

type TMote = { x: number; y: number; z: number; r: number; vx: number; vy: number; ph: number; tw: number };

const COUNT_PER_MPX = 190; // motes per million screen pixels
const MAX = 300;
const FRAME_MS = 1000 / 30;
const SPRITE = 64; // sprite radius in pixels; drawn scaled down to each mote

/** A soft glow, opaque at the centre. `mid` is where it falls to 45%: wider for near motes. */
function glow(mid: number) {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE * 2;
  const g2 = c.getContext("2d")!;
  const g = g2.createRadialGradient(SPRITE, SPRITE, 0, SPRITE, SPRITE, SPRITE);
  g.addColorStop(0, "rgb(255, 238, 205)");
  g.addColorStop(mid, "rgba(255, 220, 170, 0.45)");
  g.addColorStop(1, "rgba(255, 210, 160, 0)");
  g2.fillStyle = g;
  g2.fillRect(0, 0, SPRITE * 2, SPRITE * 2);
  return c;
}

function spawn(w: number, h: number, anywhere: boolean): TMote {
  const z = Math.random() ** 1.6; // mostly far, a few close to the camera
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 20,
    z,
    r: 0.5 + z * 3.25,
    vx: 6 + z * 34 + Math.random() * 8,
    vy: -(5 + z * 22 + Math.random() * 6),
    ph: Math.random() * Math.PI * 2,
    tw: 0.4 + Math.random() * 1.6,
  };
}

export function DustCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let motes: TMote[] = [];
    const far = glow(0.35);
    const near = glow(0.5);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w;
      canvas.height = h;
      const n = Math.min(MAX, Math.round(((w * h) / 1e6) * COUNT_PER_MPX) + 20);
      motes = Array.from({ length: n }, () => spawn(w, h, true));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        // wind with gusts, plus a slow sway of each mote
        const gust = 1 + 0.5 * Math.sin(t * 0.35 + m.z * 3);
        m.x += (m.vx * gust + Math.sin(t * 0.8 + m.ph) * 10 * m.z) * dt;
        m.y += (m.vy + Math.cos(t * 0.6 + m.ph) * 6) * dt;
        if (m.y < -20 || m.x > w + 20) {
          motes[i] = spawn(w, h, false);
          if (Math.random() < 0.5) {
            motes[i].x = -20;
            motes[i].y = Math.random() * h;
          }
          continue;
        }
        const twinkle = 0.55 + 0.45 * Math.sin(t * m.tw * 2 + m.ph);
        const a = Math.min(1, (0.45 + m.z * 0.6) * twinkle);
        const r = m.r * (m.z > 0.6 ? 2.6 : 1.6); // close motes are out of focus: a wider, softer glow
        ctx.globalAlpha = a;
        ctx.drawImage(m.z > 0.6 ? near : far, m.x - r, m.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
