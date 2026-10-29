/**
 * A Blueprint's tech tree, after Rust's research tree: the Blueprint at the top, its Kits
 * as research steps on olive wires, each Kit's Items hanging below it. Crafted steps are
 * lit, locked ones (waiting on another Kit) carry a padlock, and the next step has the
 * breathing corner bracket. Items in Crafting that went idle show rust and a health bar.
 */
import { useState } from "react";
import { Lock } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import type { TTreeItem, TTreeKit } from "../lib/api";
import { sortedBy, useWbHome, useWbTree } from "../lib/api";
import { RustLogo } from "../components/rust-icon";
import { ToolCupboard } from "./server-browser";
import { WbPage } from "./shell";

const GROUP_LABEL: Record<string, string> = {
  backlog: "Locked",
  unstarted: "To craft",
  started: "Crafting",
  completed: "Crafted",
  cancelled: "Scrapped",
};
const HP = [100, 65, 35, 12];

function ItemSlot({ it, ident, slug }: { it: TTreeItem; ident: string; slug: string }) {
  return (
    <Tooltip
      tooltipContent={`${ident}-${it.seq} · ${it.name} · ${GROUP_LABEL[it.group]}${it.decay ? " · decaying" : ""}`}
    >
      <Link
        to={`/${slug}/browse/${ident}-${it.seq}/`}
        className={cn("wb-tt-item", `wb-tt-item--${it.group}`, it.decay > 0 && `wb-tt-item--decay${it.decay}`)}
      >
        <span className="wb-tt-item__name">{it.name}</span>
        {it.group === "completed" && <span className="wb-tt-item__ok">✓</span>}
        {it.group === "started" && (
          <span className="wb-slot__hp">
            <i style={{ width: `${HP[it.decay]}%` }} />
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function KitNode({
  kit,
  next,
  pid,
  ident,
  slug,
}: {
  kit: TTreeKit;
  next: boolean;
  pid: string;
  ident: string;
  slug: string;
}) {
  const [all, setAll] = useState(false);
  const items = sortedBy(kit.items, order);
  const shown = all ? items : items.slice(0, 6);
  return (
    <div className={cn("wb-tt-col", `wb-tt-col--${kit.state}`)}>
      <Tooltip
        tooltipContent={`${kit.name} · ${kit.done}/${kit.total} crafted${kit.state === "locked" ? " · locked" : ""}`}
      >
        <Link to={`/${slug}/projects/${pid}/modules/${kit.id}`} className={cn("wb-tt-kit", next && "wb-tt-kit--next")}>
          {next && <span className="wb-brk" aria-hidden />}
          <RustLogo logo={kit.logo} size={46} />
          {kit.state === "locked" && (
            <span className="wb-tt-kit__lock">
              <Lock className="size-4" />
            </span>
          )}
          <span className="wb-tt-kit__cnt">
            {kit.done}/{kit.total}
          </span>
        </Link>
      </Tooltip>
      <div className="wb-tt-kit__name">{kit.name}</div>
      {!!items.length && (
        <div className="wb-tt-items">
          {shown.map((it) => (
            <ItemSlot key={it.id} it={it} ident={ident} slug={slug} />
          ))}
          {items.length > 6 && (
            <button type="button" className="wb-tt-more" onClick={() => setAll(!all)}>
              {all ? "Less" : `+${items.length - 6} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// crafting first, then to-craft, locked, crafted last
function order(it: TTreeItem) {
  return { started: 0, unstarted: 1, backlog: 2, completed: 3, cancelled: 4 }[it.group] ?? 5;
}

export function TechTree() {
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const pid = projectId?.toString();
  const { data, error } = useWbTree(pid);
  const { data: home } = useWbHome();
  const [tc, setTc] = useState(false);
  const bpHome = home?.blueprints.find((b) => b.id === pid);

  if (error) return <WbPage title="Tech tree">{<p className="wb-muted">This Blueprint has no tree.</p>}</WbPage>;
  if (!data || !pid) return <WbPage title="Tech tree">{<p className="wb-muted">Loading the tree…</p>}</WbPage>;

  const kits = sortedBy(data.kits, kitOrder);
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  return (
    <WbPage title={data.blueprint.name}>
      <div className="wb-tt">
        <div className="wb-tt__top">
          <div className={cn("wb-tt-root", data.learned && "wb-tt-root--learned")}>
            <RustLogo logo={data.blueprint.logo} size={64} />
          </div>
          <div className="wb-tt__title">
            <small>{data.learned ? "Blueprint learned" : "Blueprint"}</small>
            <h1>{data.blueprint.name}</h1>
            <div className="wb-tt__bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="wb-tags">
              <i>
                {data.done}/{data.total} crafted
              </i>
              {data.blueprint.target && <i>Target {new Date(data.blueprint.target).toLocaleDateString()}</i>}
              {data.blueprint.domain && <i>{data.blueprint.domain}</i>}
              <button type="button" className={cn("wb-mode", `wb-mode--${data.tc.state}`)} onClick={() => setTc(true)}>
                Tool Cupboard
              </button>
              <Link className="wb-tags__link" to={`/${slug}/projects/${pid}/issues/`}>
                All items →
              </Link>
            </div>
          </div>
        </div>

        {!!kits.length && (
          <div className="wb-tt__tree">
            <div className="wb-tt__bus" />
            <div className="wb-tt__cols">
              {kits.map((k) => (
                <KitNode
                  key={k.id}
                  kit={k}
                  next={k.id === data.next}
                  pid={pid}
                  ident={data.blueprint.identifier}
                  slug={slug}
                />
              ))}
            </div>
          </div>
        )}

        {!!data.loose.length && (
          <div className="wb-tt__loose">
            <h3>{kits.length ? "Items without a Kit" : "Items"}</h3>
            {(data.loose_groups ?? [{ tag: null, name: null, color: null, items: data.loose, done: 0, total: 0 }]).map(
              (g) => (
                <section key={g.tag ?? "none"} className="wb-tt-group">
                  {g.name && (
                    <h4 className="wb-tt-group__hd">
                      <i style={{ background: g.color ?? undefined }} />
                      <span>{g.name}</span>
                      <b>
                        {g.done}/{g.total}
                      </b>
                    </h4>
                  )}
                  <div className="wb-tt-items wb-tt-items--grid">
                    {sortedBy(g.items, order).map((it) => (
                      <ItemSlot key={it.id} it={it} ident={data.blueprint.identifier} slug={slug} />
                    ))}
                  </div>
                </section>
              )
            )}
          </div>
        )}
        {!kits.length && !data.loose.length && (
          <p className="wb-muted">Nothing here yet. Add Kits and Items to this Blueprint.</p>
        )}
      </div>
      {tc && bpHome && <ToolCupboard bp={bpHome} onClose={() => setTc(false)} />}
    </WbPage>
  );
}

// next / crafting first, crafted last: the tree reads left to right like a plan
function kitOrder(k: TTreeKit) {
  return { crafting: 0, "to-craft": 1, locked: 2, crafted: 3 }[k.state];
}
