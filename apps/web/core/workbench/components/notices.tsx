/**
 * Rust-style notices ("ITEM CRAFTED", "BLUEPRINT LEARNED"): a dark plate with a coloured
 * bar, the item icon and the name, sliding in at the bottom right, one after another.
 * Fed by the companion's live events and by "crafted while you were away" on load.
 */
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@plane/utils";
import type { TLogo } from "../lib/api";
import { play } from "../sound/engine";
import type { TSoundSlot } from "../sound/engine";
import { RustItem, RustLogo } from "./rust-icon";

export type TNotice = {
  id: string;
  kind: "crafted" | "learned" | "scrapped" | "info" | "bought";
  title: string;
  name: string;
  logo?: TLogo;
  item?: string;
  scrap?: number;
  href?: string;
};

const SHOW_MS = 4200;
const MAX = 4;
let queue: TNotice[] = [];
let shown: TNotice[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const SOUND: Record<TNotice["kind"], TSoundSlot> = {
  crafted: "link",
  learned: "move",
  scrapped: "close",
  info: "refresh",
  bought: "move",
};

function pump() {
  if (shown.length >= MAX || !queue.length) return;
  const n = queue.shift()!;
  shown = [...shown, n];
  play(SOUND[n.kind]);
  emit();
  window.setTimeout(() => {
    shown = shown.filter((s) => s.id !== n.id);
    emit();
    pump();
  }, SHOW_MS);
  // the next one follows a beat later, like Rust's stacked notices
  if (queue.length) window.setTimeout(pump, 700);
}

export function pushNotice(n: Omit<TNotice, "id">) {
  queue.push({ ...n, id: `${Date.now()}-${Math.random()}` });
  pump();
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}
const snapshot = () => shown;
const EMPTY: TNotice[] = [];

export function NoticeStack({ frame }: { frame?: string }) {
  const list = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => () => void (queue = []), []);
  return (
    <div className="wb-notices" aria-live="polite">
      {list.map((n) => (
        <a
          key={n.id}
          href={n.href}
          className={cn("wb-notice", `wb-notice--${n.kind}`, frame && `wb-notice--${frame}`)}
          data-wb-silent
        >
          <span className="wb-notice__icon">
            {n.item ? <RustItem item={n.item} size={34} /> : <RustLogo logo={n.logo} size={30} />}
          </span>
          <span className="wb-notice__body">
            <span className="wb-notice__title">{n.title}</span>
            <span className="wb-notice__name">{n.name}</span>
          </span>
          {!!n.scrap && (
            <span className="wb-notice__scrap">
              <RustItem item="scrap" size={18} />+{n.scrap}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
