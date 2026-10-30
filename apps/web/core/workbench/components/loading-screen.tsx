/**
 * Rust's loading screen while the app boots: the game's loading art, the WORKBENCH mark, a
 * spinner, cycling status lines and a filling bar. It shows in the prerendered HTML (before
 * any JS runs) and in Plane's boot spinners. The animations count from page load, so the
 * screen carries on smoothly when one of those swaps for the next.
 */
import type { CSSProperties } from "react";

const STEPS = ["Connecting to game server", "Loading blueprints", "Receiving entities", "Spawning"];

export function WbLoadingScreen() {
  const since = typeof performance === "undefined" ? 0 : performance.now() / 1000;
  return (
    <div
      className="wb-load"
      role="status"
      aria-label="Loading Workbench"
      style={{ "--t": `-${since.toFixed(2)}s` } as CSSProperties}
      suppressHydrationWarning
    >
      <div className="wb-load__bg" aria-hidden />
      <div className="wb-load__brand">
        <b>Workbench</b>
        <small>Game Server</small>
      </div>
      <div className="wb-load__foot">
        <span className="wb-load__spin" aria-hidden />
        <span className="wb-load__steps">
          {STEPS.map((s, i) => (
            <span key={s} style={{ "--i": i } as CSSProperties}>
              {s}
            </span>
          ))}
        </span>
        <span className="wb-load__bar" aria-hidden>
          <i />
        </span>
      </div>
    </div>
  );
}
