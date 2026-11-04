/**
 * The main menu (replaces Plane's Home), after Rust's launcher: the launcher art, OVERDUE and
 * DUE SOON (open Items past or near their target date), a news feed of crafted Items and the wipe headline.
 * After a wipe, the wipe report opens once.
 */
import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import type { THomeDeadline } from "../lib/api";
import { useWbHome, useWbState } from "../lib/api";
import { currentWipe, leftText } from "../lib/wipe";
import { RustItem, RustLogo } from "../components/rust-icon";
import { useNow } from "../components/top-bar";
import { MenuScene, MenuVideo } from "../components/scene";
import { DEFAULT_SCENES, bannerSlug, isVideo, videoPoster, videoUrl } from "../lib/scenes";
import { WipeReportModal } from "./wipe-report";
import { Panel, WbPage, ago } from "./shell";

const SHOW = 4;

function dueText(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} late`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** Items with a deadline that has passed or is close: one row each, opening the Item */
function DuePanel({ title, rows, slug, late }: { title: string; rows: THomeDeadline[]; slug: string; late?: boolean }) {
  return (
    <Panel
      title={
        <>
          {title} <b className={cn("wb-due__n", late && "wb-due__n--late")}>{rows.length}</b>
        </>
      }
      className={cn("wb-due__panel", late && "wb-due__panel--late")}
    >
      {rows.slice(0, SHOW).map((d) => (
        <Link key={d.id} to={`/${slug}/browse/${d.identifier}-${d.seq}/`} className="wb-join">
          <RustLogo logo={d.logo} size={26} />
          <span className="wb-join__body">
            <b>{d.name}</b>
            <span className="wb-tags">
              <i className={d.days < 0 ? "wb-tag--decaying" : "wb-tag--due"}>{dueText(d.days)}</i>
              {d.group === "started" && <i className="wb-tag--protected">Crafting</i>}
              <i className="wb-tags__ago">{d.project_name}</i>
            </span>
          </span>
          <span className="wb-join__go">
            <Play className="size-3.5" />
          </span>
        </Link>
      ))}
      {rows.length > SHOW && <p className="wb-muted">+{rows.length - SHOW} more</p>}
    </Panel>
  );
}

export function MainMenu() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data, error } = useWbHome();
  const { data: state } = useWbState();
  const now = useNow(30_000);
  const [report, setReport] = useState<number | null>(null);

  // the scene fills the whole window: the sidebar and the header turn see-through while the menu is open
  useEffect(() => {
    const c = document.documentElement.classList;
    c.add("wb-menu-open");
    return () => c.remove("wb-menu-open");
  }, []);

  useEffect(() => {
    if (data?.report_due !== undefined && data.report_due !== null) setReport(data.report_due);
  }, [data?.report_due]);

  const banner = state?.equipped.banner ? bannerSlug(state.equipped.banner) : "default";
  const scenes = useMemo(() => (banner === "default" ? DEFAULT_SCENES : [banner]), [banner]);
  const wipe = now ? currentWipe(now) : null;
  const due = data?.deadlines ?? [];
  const late = due.filter((d) => d.days < 0);
  const soon = due.filter((d) => d.days >= 0);

  return (
    <WbPage active="home" title="Home" bare>
      <div className={cn("wb-menu", `wb-scene--${banner}`)}>
        {/* Rust launcher art (theme/menu): fades in from black, drifts, and crossfades; or a video loop */}
        <div className="wb-menu__bg" aria-hidden>
          {isVideo(banner) ? (
            <MenuVideo key={banner} src={videoUrl(banner)} poster={videoPoster(banner)} className="wb-menu__scene" />
          ) : (
            <MenuScene key={banner} scenes={scenes} className="wb-menu__scene" />
          )}
        </div>
        {error && (
          <div className="wb-menu__err">The Workbench server is offline. Your Items are fine: use the sidebar.</div>
        )}

        {/* deadlines: what is late, then what is due within a week */}
        <div className="wb-menu__join wb-due">
          {late.length > 0 && <DuePanel title="Overdue" rows={late} slug={slug} late />}
          {soon.length > 0 && <DuePanel title="Due soon" rows={soon} slug={slug} />}
          {data && !late.length && !soon.length && (
            <Panel title="Deadlines" className="wb-due__panel">
              <p className="wb-muted">Nothing due this week. The server is quiet.</p>
            </Panel>
          )}
        </div>

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
              ? `${data.wipe.crafted ?? 0} items crafted this wipe (+${data.wipe.scrap ?? 0} scrap).`
              : "Loading the server…"}
          </p>
          <div className="wb-hero__btns">
            <Link className="wb-btn wb-btn--ghost" to={`/${slug}/wb/wipe`}>
              Wipe report
            </Link>
          </div>
        </div>
      </div>
      {report !== null && <WipeReportModal index={report} onClose={() => setReport(null)} />}
    </WbPage>
  );
}
