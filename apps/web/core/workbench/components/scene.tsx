/**
 * The main-menu scene on one canvas: the launcher picture drifting slowly (or a crossfade
 * through several), smoke rolling across it, and dust floating up through the light.
 *
 * Kept light on purpose. Everything is drawn at 30 frames a second into a single canvas
 * sized to the picture's own detail (never above 1.5x, the pictures are at most 1920 px
 * wide), instead of three full-screen Retina layers moving on their own. Only the current
 * picture is loaded, plus the next one shortly before its turn. Pauses while the tab is
 * hidden. The motion matches the old CSS version: drift 12 s, smoke 16 s, crossfade 2.5 s.
 */
import { useEffect, useRef } from "react";
import { sceneTallUrl, sceneUrl } from "../lib/scenes";

const FRAME_MS = 1000 / 30;
const HOLD_MS = 12_000; // each picture of a crossfade stays this long
const FADE_MS = 2_500;
const DRIFT_S = 12;
const FOG_S = 16;
const MAX_SCALE = 1.5;

// ---- dust
type TMote = { x: number; y: number; z: number; r: number; vx: number; vy: number; ph: number; tw: number };
const MOTES_PER_MPX = 190; // per million screen pixels
const MAX_MOTES = 300;
const SPRITE = 64; // glow sprite radius in pixels, drawn scaled down to each mote

// ---- smoke: three soft blobs on a layer 220% x 140% of the screen (x, y, radius x, radius y, alpha)
const FOG: Array<[number, number, number, number, number, string]> = [
  [0.2, 0.7, 0.22, 0.16, 0.16, "190, 178, 160"],
  [0.55, 0.82, 0.3, 0.18, 0.14, "170, 160, 145"],
  [0.8, 0.6, 0.18, 0.12, 0.1, "200, 190, 170"],
];

/** 0..1..0 over `period` seconds, eased in and out like CSS `ease-in-out ... alternate` */
function swing(t: number, period: number) {
  const u = (t / period) % 2;
  const x = u < 1 ? u : 2 - u;
  return x * x * (3 - 2 * x);
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

/** The picture as CSS drew it: `62% 30% / cover` on a box 3% larger than the screen on every
 * side, then `scale(s) translate(tx, ty)` from its centre. */
function drawPicture(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  t: number,
  alpha: number
) {
  const k = swing(t, DRIFT_S);
  const s = 1.02 + 0.12 * k;
  const ew = w * 1.06;
  const eh = h * 1.06;
  const tx = (0.01 - 0.04 * k) * ew;
  const ty = (0.005 - 0.02 * k) * eh;
  const cover = Math.max(ew / img.naturalWidth, eh / img.naturalHeight);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;
  const left = -0.03 * w + (ew - dw) * 0.62;
  const top = -0.03 * h + (eh - dh) * 0.3;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, w / 2 + s * (left + tx - w / 2), h / 2 + s * (top + ty - h / 2), dw * s, dh * s);
}

/** The smoke layer: `translate(-14%..14%, 1%..-2%) scale(1..1.08)` from its centre. */
function drawFog(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const k = swing(t, FOG_S);
  const ew = w * 2.2;
  const eh = h * 1.4;
  const s = 1 + 0.08 * k;
  const tx = (-0.14 + 0.28 * k) * ew;
  const ty = (0.01 - 0.03 * k) * eh;
  ctx.globalAlpha = 1;
  for (const [bx, by, rx, ry, a, rgb] of FOG) {
    const cx = w / 2 + tx + s * (-0.6 * w + bx * ew - w / 2);
    const cy = h / 2 + ty + s * (-0.2 * h + by * eh - h / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx * ew * s, ry * eh * s);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(0.7, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
}

export function MenuScene({ scenes, className }: { scenes: string[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !scenes.length) return;
    const portrait = window.matchMedia("(orientation: portrait)");
    const images = new Map<string, HTMLImageElement>();
    const picture = (slug: string) => {
      const url = (portrait.matches && sceneTallUrl(slug)) || sceneUrl(slug);
      let img = images.get(url);
      if (!img) {
        img = new Image();
        img.decoding = "async";
        img.src = url;
        images.set(url, img);
      }
      return img.complete && img.naturalWidth ? img : null;
    };

    const far = glow(0.35);
    const near = glow(0.5);
    let w = 0;
    let h = 0;
    let scale = 0;
    let motes: TMote[] = [];
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      scale = 0; // re-picked on the next frame from the picture on screen
      const n = Math.min(MAX_MOTES, Math.round(((w * h) / 1e6) * MOTES_PER_MPX) + 20);
      motes = Array.from({ length: n }, () => spawn(w, h, true));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // crossfade: which picture is on, which one is leaving, and when each drift started
    const t0 = performance.now();
    let at = 0;
    let prev = -1;
    let switched = t0;
    const since = [t0];

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;

      if (scenes.length > 1 && now - switched >= HOLD_MS) {
        prev = at;
        at = (at + 1) % scenes.length;
        switched = now;
        since[at] = now;
      }
      if (scenes.length > 1 && now - switched > HOLD_MS - FADE_MS) picture(scenes[(at + 1) % scenes.length]); // preload
      const fade = prev < 0 ? 1 : Math.min(1, (now - switched) / FADE_MS);
      if (fade === 1) prev = -1;

      const img = picture(scenes[at]);
      const want = Math.min(window.devicePixelRatio || 1, MAX_SCALE, Math.max(1, (img?.naturalWidth ?? 0) / w));
      if (want !== scale) {
        scale = want;
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.imageSmoothingQuality = "high";
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);

      const old = prev >= 0 ? picture(scenes[prev]) : null;
      const e = fade * fade * (3 - 2 * fade);
      if (old) drawPicture(ctx, old, w, h, (now - (since[prev] ?? t0)) / 1000, 1 - e);
      if (img) drawPicture(ctx, img, w, h, (now - (since[at] ?? t0)) / 1000, old ? e : 1);
      drawFog(ctx, w, h, (now - t0) / 1000);

      // dust rides a light wind with a lazy sway and twinkles as it catches the light
      const t = now / 1000;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
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
        const r = m.r * (m.z > 0.6 ? 2.6 : 1.6); // close motes are out of focus: a wider, softer glow
        ctx.globalAlpha = Math.min(1, (0.45 + m.z * 0.6) * twinkle);
        ctx.drawImage(m.z > 0.6 ? near : far, m.x - r, m.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
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
  }, [scenes]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
