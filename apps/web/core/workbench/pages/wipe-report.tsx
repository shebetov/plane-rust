/**
 * The wipe report, Rust server-wipe style: big WIPE stencil, the dates, what was crafted
 * and scrapped, scrap earned, every active Blueprint (neglected ones in red) and what to
 * craft next. Opens once after each wipe (modal); the Wipe tab shows the wipe in progress.
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { mutate } from "swr";
import { cn } from "@plane/utils";
import type { TWipeReport } from "../lib/api";
import { useWbReport, useWbState, wb } from "../lib/api";
import { currentWipe } from "../lib/wipe";
import { play } from "../sound/engine";
import { RustItem, RustLogo } from "../components/rust-icon";
import { WbPage } from "./shell";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ReportCard({ r, live }: { r: TWipeReport; live?: boolean }) {
  const max = Math.max(1, ...r.blueprints.map((b) => b.crafted));
  return (
    <div className="wb-report">
      <div className="wb-report__stencil">{live ? "This wipe" : "Wipe"}</div>
      <div className="wb-report__sub">
        #{r.number} · {fmt(r.start)} – {fmt(r.end)}
      </div>
      <div className="wb-report__stats">
        <div>
          <b>{r.crafted}</b>
          <span>Items crafted</span>
        </div>
        <div>
          <b>{r.scrapped}</b>
          <span>Scrapped</span>
        </div>
        <div className="wb-report__scrap">
          <b>
            <RustItem item="scrap" size={22} />
            {r.scrap}
          </b>
          <span>Scrap earned</span>
        </div>
        <div>
          <b>{r.blueprints.filter((b) => b.neglected).length}</b>
          <span>{live ? "Untouched" : "Neglected"}</span>
        </div>
      </div>
      <h3 className="wb-report__h">Activity by Blueprint</h3>
      <ul className="wb-bars">
        {r.blueprints.map((b) => (
          <li key={b.id} className={cn(b.neglected && !live && "wb-bars--bad")}>
            <RustLogo logo={b.logo} size={18} />
            <span className="wb-bars__name">{b.name}</span>
            <span className="wb-bars__bar">
              <i style={{ width: `${(b.crafted / max) * 100}%` }} />
            </span>
            <span className="wb-bars__n">{b.neglected ? (live ? "Untouched" : "Neglected") : b.crafted}</span>
          </li>
        ))}
        {!r.blueprints.length && <li className="wb-muted">No active Blueprints.</li>}
      </ul>
      {!!r.next.length && (
        <>
          <h3 className="wb-report__h">Craft next</h3>
          <ul className="wb-next">
            {r.next.map((n) => (
              <li key={`${n.blueprint}-${n.kit}`}>
                <RustLogo logo={n.logo} size={22} />
                <span>
                  <b>{n.kit}</b>
                  <small>{n.blueprint}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function WipeReportModal({ index, onClose }: { index: number; onClose: () => void }) {
  const { data } = useWbReport(index);
  useEffect(() => {
    if (data) play("refresh");
  }, [data]);
  if (!data) return null;
  const start = () => {
    play("move");
    void wb
      .post("wipe-seen", { index })
      .then(() => mutate("wb:home"))
      .catch(() => null);
    onClose();
  };
  return (
    <div className="wb-modal" role="dialog" aria-modal="true" aria-label="Wipe report" data-wb-panel>
      <div className="wb-modal__card">
        <ReportCard r={data} />
        <button type="button" className="wb-btn wb-btn--green wb-btn--wide" onClick={start} data-wb-silent>
          Start wipe
        </button>
      </div>
    </div>
  );
}

export function WipePage() {
  const { workspaceSlug } = useParams();
  const { data: state } = useWbState();
  const cur = currentWipe(new Date());
  const index = state?.wipe.index ?? cur.number - 1;
  const { data: live } = useWbReport(index);
  const { data: last } = useWbReport(index > 0 ? index - 1 : null);
  return (
    <WbPage active="wipe" title="Wipe">
      <div className="wb-wipe-page">
        {live ? <ReportCard r={live} live /> : <p className="wb-muted">Loading…</p>}
        {last && (
          <details className="wb-details">
            <summary>Last wipe · #{last.number}</summary>
            <ReportCard r={last} />
          </details>
        )}
        <p className="wb-muted">
          A server wipe every second Thursday. Unfinished Items roll over to the next Wipe in every Blueprint.{" "}
          <Link to={`/${workspaceSlug?.toString()}/wb/blueprints`}>Open the server browser</Link>.
        </p>
      </div>
    </WbPage>
  );
}
