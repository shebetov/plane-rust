/**
 * The main-menu background: one picture, or a crossfade through several. Only the previous,
 * current and next pictures are mounted, so the rest load when their turn comes. Give it a
 * `key` per scene list so a new list starts from its first picture.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@plane/utils";
import { sceneTallUrl, sceneUrl } from "../lib/scenes";

const HOLD_MS = 12_000;

export function MenuBackdrop({ scenes }: { scenes: string[] }) {
  const [at, setAt] = useState(0);
  const n = scenes.length;

  useEffect(() => {
    if (n < 2) return;
    const t = window.setInterval(() => setAt((i) => (i + 1) % n), HOLD_MS);
    return () => window.clearInterval(t);
  }, [n]);

  const shown = n < 3 ? scenes.map((_, i) => i) : [(at + n - 1) % n, at, (at + 1) % n];
  return (
    <span className="wb-menu__art">
      {shown.map((i) => {
        const slug = scenes[i];
        const tall = sceneTallUrl(slug);
        const style = {
          "--wb-bg": `url("${sceneUrl(slug)}")`,
          ...(tall && { "--wb-bg-tall": `url("${tall}")` }),
        } as CSSProperties;
        return <i key={slug} className={cn(i === at && "is-on")} style={style} />;
      })}
    </span>
  );
}
