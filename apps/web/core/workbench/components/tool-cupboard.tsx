/**
 * A Blueprint's Tool Cupboard: its protection timer and upkeep, paid with scrap
 * (50 scrap for 2 more days). Shown under the goal on the research tree.
 */
import { useState } from "react";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { THomeBlueprint } from "../lib/api";
import { useWbState, wb } from "../lib/api";
import { leftText } from "../lib/wipe";
import { play } from "../sound/engine";
import { pushNotice } from "./notices";
import { RustItem } from "./rust-icon";
import { useNow } from "./top-bar";

const UPKEEP_COST = 50;

/** Paying upkeep: 50 scrap for 2 more days of protection. */
function usePayUpkeep(bp: THomeBlueprint, onPaid?: () => void) {
  const { data: state } = useWbState();
  const [busy, setBusy] = useState(false);
  const balance = state?.scrap.balance ?? 0;
  const pay = async () => {
    setBusy(true);
    try {
      await wb.post("buy", { offer: "upkeep", target: bp.id });
      pushNotice({ kind: "bought", title: "Upkeep paid", name: `${bp.name} · +2 days`, item: "cupboard.tool" });
      await Promise.all([mutate("wb:home"), mutate("wb:state")]);
      onPaid?.();
    } catch (e) {
      play("close");
      pushNotice({ kind: "scrapped", title: "Can't pay upkeep", name: (e as Error).message, item: "scrap" });
    } finally {
      setBusy(false);
    }
  };
  const payable = bp.tc.state === "protected" || bp.tc.state === "due" || bp.tc.state === "decaying";
  return { pay, busy, balance, payable, canPay: payable && !busy && balance >= UPKEEP_COST };
}

/** The Tool Cupboard upkeep screen: used in its own window and inside the Blueprint block on the tree. */
export function ToolCupboardPanel({
  bp,
  onClose,
  onPaid,
}: {
  bp: THomeBlueprint;
  onClose?: () => void;
  onPaid?: () => void;
}) {
  const now = useNow(60_000);
  const { pay, busy, balance, payable, canPay } = usePayUpkeep(bp, onPaid);
  const until = bp.tc.until ? new Date(bp.tc.until).getTime() : null;
  const left = until && now ? until - now.getTime() : 0;
  const ok = bp.tc.state === "protected" || bp.tc.state === "due";
  return (
    <div className={cn("wb-tc", `wb-tc--${bp.tc.state}`)}>
      <div className="wb-tc__hd">
        <RustItem item="cupboard.tool" size={40} />
        <span>
          <small>Tool Cupboard</small>
          <b>{bp.name}</b>
        </span>
      </div>
      <div className="wb-tc__info">
        Craft something in this Blueprint to keep it protected for 7 days. Left unattended it decays. You can also pay
        upkeep with scrap.
      </div>
      <div className="wb-tc__cost">
        <span className="wb-tc__k">Cost per 2 days</span>
        <span className="wb-tc__res">
          <RustItem item="scrap" size={34} />
          <i>x{UPKEEP_COST}</i>
        </span>
        <span className={cn("wb-tc__state", ok ? "wb-tc__state--ok" : "wb-tc__state--bad")}>
          {ok
            ? `✓ Your base will not decay for ${leftText(Math.max(0, left)).toLowerCase()}.`
            : bp.tc.state === "decaying"
              ? "✕ Your base is decaying."
              : "No upkeep needed."}
        </span>
      </div>
      <div className="wb-tc__slots">
        <span className="wb-tc__slot">
          <RustItem item="scrap" size={36} />
          <i>x{balance.toLocaleString()}</i>
        </span>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="wb-tc__slot wb-tc__slot--empty" />
        ))}
      </div>
      {(onClose || payable) && (
        <div className="wb-tc__btns">
          {onClose && (
            <button type="button" className="wb-btn wb-btn--ghost" onClick={onClose}>
              Close
            </button>
          )}
          {payable && (
            <button
              type="button"
              className="wb-btn wb-btn--green"
              disabled={!canPay}
              onClick={(e) => {
                e.stopPropagation();
                void pay();
              }}
              title={balance < UPKEEP_COST ? `Not enough scrap (${balance}/${UPKEEP_COST})` : undefined}
              data-wb-silent
            >
              {busy ? "Paying…" : `Pay upkeep · ${UPKEEP_COST}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
