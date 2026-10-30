/**
 * Rust UI sounds on Plane's own screens without touching their components:
 *  - click: any button, link, menu item, option, tab, switch or checkbox (Rust's UI tick)
 *  - open / close: a dialog appearing / going away
 *  - box: an Item's peek view opening (the small wooden box), marked data-wb-panel="box"
 * A click that opens or closes a panel plays only the panel sound. Screens with their own
 * sounds (the research tree) play them directly; any sound swallows the click of that tap.
 */
import { play } from "./engine";
import type { TSoundSlot } from "./engine";

const CLICKABLE =
  'button, a[href], [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="switch"], [role="checkbox"], input[type="checkbox"], summary';
const PANEL = '[role="dialog"], [data-wb-panel]';

let pendingClick: number | null = null;
let panelSoundAt = 0;

function panelSound(slot: TSoundSlot) {
  const now = performance.now();
  if (now - panelSoundAt < 120) return; // one sound per burst (a dialog swaps its content)
  panelSoundAt = now;
  if (pendingClick !== null) {
    window.clearTimeout(pendingClick);
    pendingClick = null;
  }
  play(slot);
}

/** the panel in an added or removed node, if any */
function panelIn(node: Node): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  if (node.matches(PANEL)) return node;
  return node.childElementCount < 40 ? node.querySelector<HTMLElement>(PANEL) : null;
}

export function startUiSounds() {
  if (typeof window === "undefined") return () => undefined;

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t?.closest || !t.closest(CLICKABLE) || t.closest("[data-wb-silent]")) return;
    if (pendingClick !== null) window.clearTimeout(pendingClick);
    // wait a beat: if this click opens or closes a panel, that sound plays instead
    pendingClick = window.setTimeout(() => {
      pendingClick = null;
      if (performance.now() - panelSoundAt > 150) play("click");
    }, 40);
  };

  const observer = new MutationObserver((records) => {
    let opened: HTMLElement | null = null;
    let closed = false;
    for (const r of records) {
      for (const n of r.addedNodes) opened ??= panelIn(n);
      for (const n of r.removedNodes) if (panelIn(n)) closed = true;
    }
    if (opened) panelSound(opened.dataset.wbPanel === "box" ? "box" : "open");
    else if (closed) panelSound("close");
  });

  document.addEventListener("click", onClick, true);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    document.removeEventListener("click", onClick, true);
    observer.disconnect();
  };
}
