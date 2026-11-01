/**
 * The main-menu background: one picture, or a crossfade through several. Only the current
 * picture is mounted, plus the previous one while it fades out; the next one is preloaded
 * into the image cache, so each full-screen layer exists only while it is on screen. Give it
 * a `key` per scene list so a new list starts from its first picture.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@plane/utils";
import { sceneTallUrl, sceneUrl } from "../lib/scenes";

const HOLD_MS = 12_000;
const FADE_MS = 2_600; // a little over the CSS crossfade

function preload(slug: string) {
  const tall = window.matchMedia("(orientation: portrait)").matches && sceneTallUrl(slug);
  const img = new Image();
  img.src = tall || sceneUrl(slug);
}

export function MenuBackdrop({ scenes }: { scenes: string[] }) {
  const [at, setAt] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const n = scenes.length;

  useEffect(() => {
    if (n < 2) return;
    const t = window.setInterval(
      () =>
        setAt((i) => {
          setPrev(i);
          return (i + 1) % n;
        }),
      HOLD_MS
    );
    return () => window.clearInterval(t);
  }, [n]);

  // the old picture leaves once its fade is over; the next one starts loading
  useEffect(() => {
    if (n > 1) preload(scenes[(at + 1) % n]);
    if (prev === null) return;
    const t = window.setTimeout(() => setPrev(null), FADE_MS);
    return () => window.clearTimeout(t);
  }, [at, prev, n, scenes]);

  const shown = prev === null || prev === at ? [at] : [prev, at];
  return (
    <span className="wb-menu__art">
      {shown.map((i) => {
        const slug = scenes[i];
        const tall = sceneTallUrl(slug);
        const style = {
          "--wb-bg": `url("${sceneUrl(slug)}")`,
          ...(tall && { "--wb-bg-tall": `url("${tall}")` }),
        } as CSSProperties;
        // a picture arriving after a switch fades in over the one leaving
        return <i key={slug} className={cn(i === at && "is-on", i === at && prev !== null && "is-in")} style={style} />;
      })}
    </span>
  );
}
