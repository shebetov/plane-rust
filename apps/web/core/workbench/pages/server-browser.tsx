/**
 * Blueprints as Rust's server browser: a filter column (Active / Learned / Empty / All),
 * rows with tag chips, the Tool Cupboard state as the "mode", crafted/total as "players",
 * Items in Crafting as "ping". A row opens the Blueprint's tech tree; the state badge
 * opens its Tool Cupboard (upkeep).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { THomeBlueprint } from "../lib/api";
import { useWbHome, useWbState, wb } from "../lib/api";
import { leftText } from "../lib/wipe";
import { play } from "../sound/engine";
import { pushNotice } from "../components/notices";
import { RustItem, RustLogo } from "../components/rust-icon";
import { WbPage, ago } from "./shell";

type TFilter = "active" | "learned" | "empty" | "all";
const FILTERS: Array<{ key: TFilter; label: string; item: string }> = [
  { key: "active", label: "Active", item: "workbench2" },
  { key: "learned", label: "Learned", item: "blueprintbase" },
  { key: "empty", label: "Planned", item: "box.wooden" },
  { key: "all", label: "All", item: "map" },
];
const MODE: Record<string, string> = {
  protected: "Protected",
  due: "Upkeep due",
  decaying: "Decaying",
  learned: "Learned",
  empty: "Empty",
};

function kindOf(b: THomeBlueprint): TFilter {
  if (b.total === 0) return "empty";
  if (b.open === 0) return "learned";
  return "active";
}

export function ToolCupboard({ bp, onClose }: { bp: THomeBlueprint; onClose: () => void }) {
  const { data: state } = useWbState();
  const [busy, setBusy] = useState(false);
  const until = bp.tc.until ? new Date(bp.tc.until) : null;
  const left = until ? until.getTime() - Date.now() : 0;
  const balance = state?.scrap.balance ?? 0;
  const pay = async () => {
    setBusy(true);
    try {
      await wb.post("buy", { offer: "upkeep", target: bp.id });
      pushNotice({ kind: "bought", title: "Upkeep paid", name: `${bp.name} · +2 days`, item: "cupboard.tool" });
      await Promise.all([mutate("wb:home"), mutate("wb:state")]);
      onClose();
    } catch (e) {
      play("close");
      pushNotice({ kind: "scrapped", title: "Can't pay upkeep", name: (e as Error).message, item: "scrap" });
    } finally {
      setBusy(false);
    }
  };
  const ok = bp.tc.state === "protected" || bp.tc.state === "due";
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="wb-modal" role="dialog" aria-modal="true" aria-label="Tool Cupboard" data-wb-panel>
      <button type="button" className="wb-modal__bg" aria-label="Close" onClick={onClose} data-wb-silent />
      <div className="wb-modal__card wb-tc">
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
            <i>x50</i>
          </span>
          <span className={cn("wb-tc__state", ok ? "wb-tc__state--ok" : "wb-tc__state--bad")}>
            {ok
              ? `✓ Your base will not decay for ${leftText(left).toLowerCase()}.`
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
        <div className="wb-tc__btns">
          <button type="button" className="wb-btn wb-btn--ghost" onClick={onClose}>
            Close
          </button>
          {(bp.tc.state === "protected" || bp.tc.state === "due" || bp.tc.state === "decaying") && (
            <button
              type="button"
              className="wb-btn wb-btn--green"
              disabled={busy || balance < 50}
              onClick={pay}
              data-wb-silent
            >
              Pay upkeep · 50
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServerBrowser() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data, mutate: reload } = useWbHome();
  const [filter, setFilter] = useState<TFilter>("active");
  const [q, setQ] = useState("");
  const [tc, setTc] = useState<THomeBlueprint | null>(null);
  const all = useMemo(() => data?.blueprints ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<TFilter, number> = { active: 0, learned: 0, empty: 0, all: all.length };
    for (const b of all) c[kindOf(b)]++;
    return c;
  }, [all]);
  const rows = all.filter(
    (b) => (filter === "all" || kindOf(b) === filter) && (!q || b.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <WbPage active="blueprints" title="Blueprints">
      <div className="wb-sb">
        <aside className="wb-sb__side">
          <h4>Blueprints</h4>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={cn("wb-sb__mode", filter === f.key && "wb-sb__mode--on")}
              onClick={() => setFilter(f.key)}
            >
              <RustItem item={f.item} size={22} />
              <span>{f.label}</span>
              <b>{counts[f.key]}</b>
            </button>
          ))}
          <div className="wb-sb__side-btns">
            <button type="button" className="wb-btn wb-btn--ghost" onClick={() => void reload()}>
              Refresh
            </button>
            <Link className="wb-btn wb-btn--amber" to={`/${slug}/projects/`}>
              New Blueprint
            </Link>
          </div>
        </aside>
        <div className="wb-sb__main">
          <input className="wb-search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="wb-sb__table">
            <div className="wb-sb__head">
              <span>Name</span>
              <span>Mode</span>
              <span>Crafted</span>
              <span>Crafting</span>
            </div>
            {rows.map((b) => (
              <div key={b.id} className="wb-sb__row">
                <Link to={`/${slug}/wb/tree/${b.id}`} className="wb-sb__name">
                  <RustLogo logo={b.logo} size={28} />
                  <span>
                    <b>{b.name}</b>
                    <span className="wb-tags">
                      <i className="wb-tag--key">{b.identifier}</i>
                      <i>Wipe #{data?.wipe.number}</i>
                      <i>{b.open} to craft</i>
                      <i className="wb-tags__ago">◷ {ago(b.last_craft)}</i>
                    </span>
                  </span>
                </Link>
                <button type="button" className={cn("wb-mode", `wb-mode--${b.tc.state}`)} onClick={() => setTc(b)}>
                  {MODE[b.tc.state]}
                </button>
                <span className="wb-sb__num">
                  <b>{b.done}</b>/{b.total}
                </span>
                <span className="wb-sb__num">{b.crafting}</span>
              </div>
            ))}
            {data && !rows.length && <p className="wb-muted wb-sb__none">No Blueprints here.</p>}
          </div>
        </div>
      </div>
      {tc && <ToolCupboard bp={tc} onClose={() => setTc(null)} />}
    </WbPage>
  );
}
