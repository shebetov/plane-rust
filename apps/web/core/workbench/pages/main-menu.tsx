/**
 * The main menu (replaces Plane's Home), after Rust's launcher: a smoky scene, QUICK JOIN
 * with the active Blueprints, a news feed of crafted Items and the wipe headline.
 * After a wipe, the wipe report opens once.
 */
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import { useWbHome, useWbState } from "../lib/api";
import { currentWipe, leftText } from "../lib/wipe";
import { RustItem, RustLogo } from "../components/rust-icon";
import { useNow } from "../components/top-bar";
import { WipeReportModal } from "./wipe-report";
import { Panel, WbPage, ago } from "./shell";

const TC_LABEL: Record<string, string> = {
  protected: "Protected",
  due: "Upkeep due",
  decaying: "Decaying",
  learned: "Learned",
  empty: "Empty",
};

export function MainMenu() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data, error } = useWbHome();
  const { data: state } = useWbState();
  const now = useNow(30_000);
  const [report, setReport] = useState<number | null>(null);

  useEffect(() => {
    if (data?.report_due !== undefined && data.report_due !== null) setReport(data.report_due);
  }, [data?.report_due]);

  const banner = state?.equipped.banner?.replace("banner-", "") ?? "default";
  const wipe = now ? currentWipe(now) : null;
  const active = (data?.blueprints ?? []).filter((b) => b.open > 0);
  const next = active.find((b) => b.crafting > 0) ?? active[0];

  return (
    <WbPage active="home" title="Main menu" bare>
      <div className={cn("wb-menu", `wb-scene--${banner}`)}>
        {error && (
          <div className="wb-menu__err">The Workbench server is offline. Your Items are fine: use the sidebar.</div>
        )}

        <Panel title="Quick join" className="wb-menu__join">
          {active.slice(0, 5).map((b) => (
            <Link key={b.id} to={`/${slug}/wb/tree/${b.id}`} className="wb-join">
              <RustLogo logo={b.logo} size={26} />
              <span className="wb-join__body">
                <b>{b.name}</b>
                <span className="wb-tags">
                  <i className={`wb-tag--${b.tc.state}`}>{TC_LABEL[b.tc.state]}</i>
                  <i>
                    {b.done}/{b.total} crafted
                  </i>
                  <i className="wb-tags__ago">{ago(b.last_craft)}</i>
                </span>
              </span>
              <span className="wb-join__go">
                <Play className="size-3.5" />
              </span>
            </Link>
          ))}
          {data && !active.length && <p className="wb-muted">Nothing to craft. Add Items to a Blueprint.</p>}
        </Panel>

        <Panel title="News" className="wb-menu__news">
          <ul className="wb-feed">
            {(data?.news ?? []).slice(0, 7).map((n) => (
              <li key={n.item_id}>
                <RustLogo logo={n.logo} size={18} />
                <span className="wb-feed__name">{n.name}</span>
                <span className="wb-feed__scrap">
                  <RustItem item="scrap" size={14} />+{n.scrap}
                </span>
                <span className="wb-feed__ago">{ago(n.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="wb-hero">
          <div className="wb-hero__kick">
            {now?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            <span className="wb-hero__tag">Wipe #{data?.wipe.number ?? wipe?.number}</span>
          </div>
          <h1 className="wb-hero__title">
            {wipe && now ? `Wipe in ${leftText(wipe.end.getTime() - now.getTime())}` : "Workbench"}
          </h1>
          <p className="wb-hero__text">
            {data
              ? `${data.wipe.crafted ?? 0} items crafted this wipe (+${data.wipe.scrap ?? 0} scrap). ${
                  next ? `Next up: ${next.name}.` : "Plan your next Blueprint."
                }`
              : "Loading the server…"}
          </p>
          <div className="wb-hero__btns">
            <Link className="wb-btn wb-btn--ghost" to={`/${slug}/wb/wipe`}>
              Wipe report
            </Link>
            {next && (
              <Link className="wb-btn wb-btn--amber" to={`/${slug}/wb/tree/${next.id}`}>
                Craft next
              </Link>
            )}
          </div>
        </div>
      </div>
      {report !== null && <WipeReportModal index={report} onClose={() => setReport(null)} />}
    </WbPage>
  );
}
