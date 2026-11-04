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
import { useEffect, useRef, useState } from "react";
import { isVideo, sceneTallUrl, sceneUrl, videoPoster, videoUrl } from "../lib/scenes";

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

/**
 * A video banner: one of the game's menu loops (H.264, 30 fps, decoded by the GPU, so it is
 * lighter than the canvas scene). Muted and inline so it may autoplay; paused while the tab is
 * hidden, and left on its first frame if it can't play. Like the canvas scene it keeps moving
 * with reduced motion.
 */
export function MenuVideo({
  src,
  poster,
  className,
  onDone,
}: {
  src: string;
  poster: string;
  className?: string;
  /** in a playlist: called once the loop has run HOLD_MS, a fade before the clip ends */
  onDone?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = () => {
      if (document.hidden) v.pause();
      else v.play().catch(() => undefined); // autoplay refused (e.g. Low Power Mode): the poster stays
    };
    sync();
    document.addEventListener("visibilitychange", sync);

    const t0 = performance.now();
    let fired = false;
    const fire = () => {
      if (fired || !done.current) return;
      fired = true;
      done.current();
    };
    // switch near the end of a loop, so the crossfade covers the jump back to its start
    const onTime = () => {
      if (performance.now() - t0 >= HOLD_MS && v.duration - v.currentTime <= FADE_MS / 1000) fire();
    };
    v.addEventListener("timeupdate", onTime);
    // a clip that never plays (refused autoplay, a failed load) shows its poster like a picture
    const stuck = setTimeout(() => (v.paused || v.readyState < 3) && fire(), HOLD_MS);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      v.removeEventListener("timeupdate", onTime);
      clearTimeout(stuck);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden
      // a play() refused while the clip was still loading (Safari) is retried once it can play
      onCanPlay={(e) =>
        !document.hidden && e.currentTarget.paused && void e.currentTarget.play().catch(() => undefined)
      }
    />
  );
}

/** One banner of the main menu: a video loop, or a picture drifting with smoke and dust. */
function Banner({ slug, className, onDone }: { slug: string; className?: string; onDone?: () => void }) {
  useEffect(() => {
    if (!onDone || isVideo(slug)) return;
    const t = setTimeout(onDone, HOLD_MS);
    return () => clearTimeout(t);
    // a picture's turn is timed once, from when it comes on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  return isVideo(slug) ? (
    <MenuVideo src={videoUrl(slug)} poster={videoPoster(slug)} className={className} onDone={onDone} />
  ) : (
    <MenuScene scenes={[slug]} className={className} />
  );
}

/** Loads what a banner shows first, so its fade-in doesn't start on an empty layer. */
function warm(slug: string) {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  new Image().src = isVideo(slug) ? videoPoster(slug) : (portrait && sceneTallUrl(slug)) || sceneUrl(slug);
}

/** A shuffled order of `slugs` that never shows the same banner twice in a row. */
function shuffled(slugs: string[], last?: string) {
  const out = [...slugs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out[0] === last) out.push(out.shift()!);
  return out;
}

/**
 * Several equipped banners, pictures and videos alike: shown in turn, shuffled, each new one
 * fading in over the one before (which is dropped once covered). A picture stays HOLD_MS; a
 * video plays at least that long and hands over near the end of its loop.
 */
export function MenuPlaylist({ slugs, className }: { slugs: string[]; className?: string }) {
  const bag = useRef<string[]>([]);
  const take = (last?: string) => {
    if (!bag.current.length) bag.current = shuffled(slugs, last);
    return bag.current.shift()!;
  };
  const [slides, setSlides] = useState(() => [{ slug: take(), n: 0 }]);
  const top = slides[slides.length - 1];

  useEffect(() => {
    if (!bag.current.length) bag.current = shuffled(slugs, top.slug);
    warm(bag.current[0]);
    if (slides.length < 2) return;
    const t = setTimeout(() => setSlides((s) => s.slice(-1)), FADE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.n]);

  const advance = () =>
    setSlides((s) => {
      const on = s[s.length - 1];
      return [on, { slug: take(on.slug), n: on.n + 1 }];
    });

  return (
    <>
      {slides.map((s) => (
        <Banner key={s.n} slug={s.slug} className={className} onDone={s === top ? advance : undefined} />
      ))}
    </>
  );
}
