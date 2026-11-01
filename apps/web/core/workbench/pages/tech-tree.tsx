/**
 * A Blueprint's research tree, after Rust's tech tree: the Blueprint at the top, a column
 * per Kit on olive wires, and every Item as its own block, hanging under what it requires
 * (or the Item it is a Component of). Lines show the way to each Kit and to the Blueprint.
 * Selecting a block lights up its whole path and opens the research panel: details,
 * requirements, what it unlocks, and the buttons to start, craft and link Items.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, Flag, Hammer, Link2, Lock, Plus, Search, X } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { mutate as mutateGlobal } from "swr";
import { cn } from "@plane/utils";
import type { THomeBlueprint, TLogo, TTag, TTree } from "../lib/api";
import { sortedBy, useWbHome, useWbTree } from "../lib/api";
import type { TPlaneItem } from "../lib/plane";
import {
  addRequirement,
  plainText,
  removeRequirement,
  setItemState,
  useDescription,
  usePlaneItems,
} from "../lib/plane";
import type { TColIn, TItemTile, TKitTile, TLayout, TNodeIn, TState } from "../lib/tree-layout";
import { CELL_W, GOAL, ITEM_SQ, KIT_SQ, KIT_W, ROOT_W, ROOT_W_NARROW, layoutTree, pathOf } from "../lib/tree-layout";
import { play } from "../sound/engine";
import { RustItem, RustLogo } from "../components/rust-icon";
import { ToolCupboardPanel } from "../components/tool-cupboard";
import { WbPage } from "./shell";

const STATUS: Record<string, string> = {
  started: "Crafting",
  unstarted: "To craft",
  backlog: "Locked",
  completed: "Crafted",
  cancelled: "Scrapped",
};
const GRADE: Record<string, { label: string; icon: string }> = {
  urgent: { label: "Armored", icon: "metal.refined" },
  high: { label: "Sheet Metal", icon: "metal.fragments" },
  medium: { label: "Stone", icon: "stones" },
  low: { label: "Wood", icon: "wood" },
  none: { label: "Twig", icon: "building.planner" },
};
const HP = [100, 65, 35, 12];
const NO_COL = "~";

type TSel = { kind: "item" | "col" | "root"; id: string } | null;

function StatusIcon({ group, big }: { group: string; big?: boolean }) {
  const Icon = { started: Hammer, unstarted: Circle, backlog: Lock, completed: Check, cancelled: X }[group] ?? Circle;
  return (
    <span className={cn("wb-st", `wb-st--${group}`, big && "wb-st--big")} title={STATUS[group]}>
      <Icon className={big ? "size-4" : "size-3"} strokeWidth={2.5} />
    </span>
  );
}

function due(target: string | null, group: string) {
  if (!target || group === "completed" || group === "cancelled") return null;
  const d = new Date(`${target}T00:00:00`);
  const days = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return {
    label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    late: days < 0,
    soon: days >= 0 && days <= 3,
  };
}

function decayOf(group: string, updated: string): number {
  if (group !== "started") return 0;
  const idle = (Date.now() - new Date(updated).getTime()) / 86_400_000;
  return idle >= 60 ? 3 : idle >= 30 ? 2 : idle >= 14 ? 1 : 0;
}

// ---------------------------------------------------------------- tiles

const STATE_TXT: Record<TState, string> = {
  done: "Crafted",
  active: "Crafting",
  ready: "Ready to craft",
  locked: "Needs other Items first",
  backlog: "Locked",
};

/** Rust's tick in the corner of a crafted tile */
function Tick() {
  return (
    <span className="wb-tl__tick" aria-hidden>
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}

function ItemTile({
  p,
  art,
  sel,
  dim,
  onSelect,
  onLinkStart,
  linkTarget,
}: {
  p: TItemTile;
  art: React.ReactNode;
  sel: boolean;
  dim: boolean;
  onSelect: () => void;
  onLinkStart: (e: React.PointerEvent) => void;
  linkTarget: boolean;
}) {
  const g = GRADE[p.priority] ?? GRADE.none;
  return (
    <button
      type="button"
      className={cn(
        "wb-tl wb-tl--item",
        `wb-tl--${p.state}`,
        p.decay > 0 && `wb-tl--decay${p.decay}`,
        sel && "wb-tl--sel",
        dim && "wb-tl--dim",
        linkTarget && "wb-tl--target"
      )}
      data-node={p.id}
      style={{ left: p.x, top: p.y, width: CELL_W }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={sel}
      title={`${p.name} · ${STATE_TXT[p.state]}${p.decay ? " · decaying" : ""}`}
    >
      <span className="wb-tl__sq" style={{ width: ITEM_SQ, height: ITEM_SQ }}>
        {art}
        <span className="wb-tl__grade" title={`Grade: ${g.label}`}>
          <RustItem item={g.icon} size={16} />
        </span>
        {!!p.components && (
          <span className="wb-tl__cnt" title="Components crafted">
            {p.componentsDone}/{p.components}
          </span>
        )}
        {p.state === "done" && <Tick />}
        {p.state === "locked" && <Lock className="wb-tl__lock" />}
        {p.state === "active" && (
          <span className="wb-tl__hp" title={p.decay ? "Decaying: no activity for a while" : "Crafting"}>
            <i style={{ width: `${HP[p.decay]}%` }} />
          </span>
        )}
        {p.next && <span className="wb-tl__brk" aria-hidden />}
        {/* drag from here onto another Item: "this unlocks that" */}
        <span
          className="wb-tl__port"
          role="presentation"
          title="Drag onto an Item this one unlocks"
          onPointerDown={onLinkStart}
          onClick={(e) => e.stopPropagation()}
        />
      </span>
      <span className="wb-tl__lb">{p.name}</span>
    </button>
  );
}

function KitTile({
  k,
  art,
  sel,
  dim,
  onSelect,
}: {
  k: TKitTile;
  art: React.ReactNode;
  sel: boolean;
  dim: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("wb-tl wb-tl--kit", `wb-tl--${k.state}`, sel && "wb-tl--sel", dim && "wb-tl--dim")}
      style={{ left: k.x, top: k.y, width: KIT_W }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={sel}
      title={`${k.label} · ${k.done}/${k.total} crafted`}
    >
      <span className="wb-tl__sq" style={{ width: KIT_SQ, height: KIT_SQ }}>
        {art}
        {k.color !== undefined && <i className="wb-tl__tag" style={{ background: k.color ?? undefined }} />}
        <span className="wb-tl__cnt">
          {k.done}/{k.total}
        </span>
        {k.state === "done" && <Tick />}
        {k.state === "locked" && <Lock className="wb-tl__lock" />}
        {k.state === "active" && <span className="wb-tl__hp wb-tl__hp--crawl" />}
      </span>
      <span className="wb-tl__lb">{k.label}</span>
    </button>
  );
}

/** The Blueprints, grouped by domain: switch trees without leaving the page. */
function TreeRail({ slug, current, list }: { slug: string; current: string; list: THomeBlueprint[] }) {
  const groups = new Map<string, THomeBlueprint[]>();
  for (const b of list) {
    const d = b.domain || "No domain";
    groups.set(d, [...(groups.get(d) ?? []), b]);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh copy
  const doms = [...groups.keys()].sort((a, b) => (a === "No domain" ? 1 : b === "No domain" ? -1 : a.localeCompare(b)));
  const railRef = useRef<HTMLElement>(null);
  useEffect(() => {
    railRef.current
      ?.querySelector<HTMLElement>(".wb-rail__row--on")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav ref={railRef} className="wb-rail" aria-label="Blueprints">
      {doms.map((d) => {
        const bps = sortedBy(groups.get(d)!, (b) => (b.total ? 0 : 1));
        return (
          <div key={d} className="wb-rail__dom">
            <h3>
              {d}
              <span>{bps.length}</span>
            </h3>
            {bps.map((b) => {
              const pct = b.total ? (b.done / b.total) * 100 : 0;
              return (
                <Link
                  key={b.id}
                  to={`/${slug}/wb/tree/${b.id}`}
                  className={cn(
                    "wb-rail__row",
                    b.id === current && "wb-rail__row--on",
                    !b.total && "wb-rail__row--empty"
                  )}
                  aria-current={b.id === current ? "page" : undefined}
                >
                  <span className="wb-rail__ic">
                    <RustLogo logo={b.logo} size={30} />
                  </span>
                  <span className="wb-rail__t">
                    <b>{b.name}</b>
                    <small>
                      <span className="wb-rail__bar">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      {b.total ? `${b.done}/${b.total}` : "No items"}
                    </small>
                  </span>
                  {b.total > 0 && (
                    <i
                      className={cn("wb-rail__tc", `wb-rail__tc--${b.tc.state}`)}
                      title={`Tool Cupboard: ${b.tc.state}`}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- research panel

function ItemLine({ it, onPick, onRemove }: { it: TNodeIn; onPick: () => void; onRemove?: () => void }) {
  return (
    <li className="wb-rp__line">
      <button type="button" onClick={onPick}>
        <StatusIcon group={it.group} />
        <span>{it.name}</span>
      </button>
      {onRemove && (
        <button type="button" className="wb-rp__x" onClick={onRemove} aria-label={`Remove requirement ${it.name}`}>
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function RequirementPicker({
  item,
  all,
  onAdd,
  onClose,
}: {
  item: TNodeIn;
  all: Map<string, TNodeIn>;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const ahead = useMemo(() => {
    // can't require something that already requires this Item (no loops)
    const out = new Set<string>([item.id]);
    const stack = [item.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of all.values())
        if (n.blockers.includes(cur) && !out.has(n.id)) {
          out.add(n.id);
          stack.push(n.id);
        }
    }
    return out;
  }, [item.id, all]);
  const query = q.trim().toLowerCase();
  const list = sortedBy(
    [...all.values()].filter(
      (n) =>
        !ahead.has(n.id) &&
        !item.blockers.includes(n.id) &&
        n.group !== "cancelled" &&
        (!query || n.name.toLowerCase().includes(query) || String(n.seq) === query.replace("#", ""))
    ),
    (n) => (n.group === "completed" ? 1 : 0)
  ).slice(0, 8);
  return (
    <div className="wb-rp__pick">
      <label className="wb-rp__search">
        <Search className="size-3.5" />
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the picker opens on demand
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find the Item it requires"
        />
        <button type="button" onClick={onClose} aria-label="Cancel">
          <X className="size-3.5" />
        </button>
      </label>
      <ul>
        {list.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onAdd(n.id)}>
              <StatusIcon group={n.group} />
              <span>{n.name}</span>
              <small>#{n.seq}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="wb-muted">Nothing matches.</li>}
      </ul>
    </div>
  );
}

function ItemPanel({
  n,
  all,
  tags,
  colLabel,
  slug,
  pid,
  ident,
  stateIds,
  onPick,
  onClose,
  onState,
  onLink,
}: {
  n: TNodeIn;
  all: Map<string, TNodeIn>;
  tags: Record<string, TTag>;
  colLabel?: string;
  slug: string;
  pid: string;
  ident: string;
  stateIds: Record<string, string>;
  onPick: (id: string) => void;
  onClose: () => void;
  onState: (id: string, group: string) => void;
  onLink: (item: string, blocker: string, add: boolean) => void;
}) {
  const { data: html } = useDescription(slug, pid, n.id);
  const [picking, setPicking] = useState(false);
  useEffect(() => setPicking(false), [n.id]);
  const text = html ? plainText(html) : "";
  const g = GRADE[n.priority] ?? GRADE.none;
  const d = due(n.target, n.group);
  const reqs = n.blockers.map((b) => all.get(b)).filter((x): x is TNodeIn => !!x);
  const unlocks = [...all.values()].filter((x) => x.blockers.includes(n.id));
  const comps = [...all.values()].filter((x) => x.parent === n.id && x.group !== "cancelled");
  const parent = n.parent ? all.get(n.parent) : undefined;
  const open = reqs.filter((r) => r.group !== "completed" && r.group !== "cancelled").length;
  const next =
    n.group === "started"
      ? { label: "Craft", group: "completed", cls: "wb-btn--green" }
      : n.group === "completed" || n.group === "cancelled"
        ? { label: "Reopen", group: "unstarted", cls: "wb-btn--ghost" }
        : { label: "Start crafting", group: "started", cls: "wb-btn--amber" };
  return (
    <aside className="wb-rp" aria-label="Research panel">
      <header className="wb-rp__hd">
        <StatusIcon group={n.group} big />
        <span className="wb-rp__kick">
          {ident}-{n.seq} · {STATUS[n.group]}
        </span>
        <button type="button" className="wb-rp__close" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </header>
      <h2 className="wb-rp__title">{n.name}</h2>
      <div className="wb-rp__chips">
        <span className="wb-grade-chip">
          <RustItem item={g.icon} size={18} />
          {g.label}
        </span>
        {colLabel && <span className="wb-pill">{colLabel}</span>}
        {n.labels
          .map((l) => tags[l])
          .filter(Boolean)
          .map((tg) => (
            <span key={tg.name} className="wb-pill">
              <i style={{ background: tg.color ?? undefined }} />
              {tg.name}
            </span>
          ))}
        {d && (
          <span className={cn("wb-pill", d.late && "wb-pill--late", d.soon && "wb-pill--soon")}>Due {d.label}</span>
        )}
      </div>
      {open > 0 && n.group !== "completed" && (
        <p className="wb-rp__warn">
          <Lock className="size-3.5" /> Requires {open} more Item{open > 1 ? "s" : ""} first
        </p>
      )}
      <div className="wb-rp__btns">
        <button
          type="button"
          className={cn("wb-btn", next.cls)}
          disabled={!stateIds[next.group]}
          onClick={() => onState(n.id, next.group)}
          data-wb-silent
        >
          {next.label}
        </button>
        <Link className="wb-btn wb-btn--ghost" to={`/${slug}/browse/${ident}-${n.seq}/`}>
          Open item
        </Link>
      </div>
      {text && <p className="wb-rp__desc">{text}</p>}

      <section className="wb-rp__sec">
        <h3>
          Requires <b>{reqs.length}</b>
          {!picking && (
            <button type="button" className="wb-rp__add" onClick={() => setPicking(true)}>
              <Plus className="size-3.5" /> Add
            </button>
          )}
        </h3>
        {picking && (
          <RequirementPicker
            item={n}
            all={all}
            onClose={() => setPicking(false)}
            onAdd={(id) => {
              setPicking(false);
              onLink(n.id, id, true);
            }}
          />
        )}
        <ul>
          {reqs.map((r) => (
            <ItemLine key={r.id} it={r} onPick={() => onPick(r.id)} onRemove={() => onLink(n.id, r.id, false)} />
          ))}
          {!reqs.length && !picking && <li className="wb-muted">Nothing: it can be crafted any time.</li>}
        </ul>
      </section>
      {(!!comps.length || parent) && (
        <section className="wb-rp__sec">
          <h3>{parent ? "Component of" : "Components"}</h3>
          <ul>
            {parent && <ItemLine it={parent} onPick={() => onPick(parent.id)} />}
            {comps.map((c) => (
              <ItemLine key={c.id} it={c} onPick={() => onPick(c.id)} />
            ))}
          </ul>
        </section>
      )}
      {!!unlocks.length && (
        <section className="wb-rp__sec">
          <h3>
            Unlocks <b>{unlocks.length}</b>
          </h3>
          <ul>
            {unlocks.map((u) => (
              <ItemLine key={u.id} it={u} onPick={() => onPick(u.id)} />
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function SummaryPanel({
  title,
  icon,
  kicker,
  items,
  isReady,
  done,
  total,
  links,
  onPick,
  onClose,
}: {
  title: string;
  icon: React.ReactNode;
  kicker: string;
  items: TNodeIn[];
  isReady: (n: TNodeIn) => boolean;
  done: number;
  total: number;
  links: React.ReactNode;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const crafting = items.filter((p) => p.group === "started");
  const ready = items.filter(isReady);
  const pct = total ? (done / total) * 100 : 0;
  return (
    <aside className="wb-rp" aria-label="Research panel">
      <header className="wb-rp__hd">
        <span className="wb-rp__kick">{kicker}</span>
        <button type="button" className="wb-rp__close" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </header>
      <div className="wb-rp__hero">
        {icon}
        <h2 className="wb-rp__title">{title}</h2>
      </div>
      <div className="wb-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="wb-rp__stat">
        {done}/{total} crafted · {crafting.length} crafting · {ready.length} ready
      </p>
      {links && <div className="wb-rp__btns">{links}</div>}
      {!!crafting.length && (
        <section className="wb-rp__sec">
          <h3>
            Crafting <b>{crafting.length}</b>
          </h3>
          <ul>
            {crafting.map((p) => (
              <ItemLine key={p.id} it={p} onPick={() => onPick(p.id)} />
            ))}
          </ul>
        </section>
      )}
      <section className="wb-rp__sec">
        <h3>
          Ready to craft <b>{ready.length}</b>
        </h3>
        <ul>
          {ready.slice(0, 10).map((p) => (
            <ItemLine key={p.id} it={p} onPick={() => onPick(p.id)} />
          ))}
          {!ready.length && <li className="wb-muted">Nothing ready: everything open needs something first.</li>}
        </ul>
      </section>
    </aside>
  );
}

// ---------------------------------------------------------------- page

/** The research block under a screen point (while dragging a link). */
function nodeAt(cx: number, cy: number): string | null {
  return (
    (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>("[data-node]")?.dataset.node ?? null
  );
}

export function readPref(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* not remembered in private mode */
  }
}

function buildNodes(items: TPlaneItem[], t: TTree): TNodeIn[] {
  return items.map((it) => {
    const group = t.state_groups?.[it.state_id] ?? "backlog";
    return {
      id: it.id,
      name: it.name,
      seq: it.sequence_id,
      group,
      priority: it.priority ?? "none",
      target: it.target_date,
      decay: decayOf(group, it.updated_at),
      parent: it.parent_id,
      labels: it.label_ids ?? [],
      kits: it.module_ids ?? [],
      components: it.sub_issues_count ?? 0,
      blockers: (it.issue_relation ?? []).filter((r) => r.relation_type === "blocked_by").map((r) => r.id),
    };
  });
}

function columnsFor(t: TTree | undefined, nodes: TNodeIn[]) {
  const tags = t?.labels ?? {};
  const kits = t?.kits ?? [];
  const kitIds = new Set(kits.map((k) => k.id));
  const open = nodes.filter((n) => n.group !== "cancelled");
  if (kits.length) {
    const cols: TColIn[] = kits.map((k) => ({ key: k.id, label: k.name, logo: k.logo, needs: k.needs }));
    if (open.some((n) => !n.kits.some((k) => kitIds.has(k))))
      cols.push({ key: NO_COL, label: "No Kit", logo: t?.blueprint.logo });
    return { cols, mode: "kit" as const, of: (n: TNodeIn) => n.kits.find((k) => kitIds.has(k)) ?? NO_COL };
  }
  const used = [...new Set(open.flatMap((n) => n.labels.filter((l) => tags[l])))];
  if (used.length) {
    const cols: TColIn[] = used.map((id) => ({ key: id, label: tags[id].name, color: tags[id].color }));
    // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh copy
    cols.sort((a, b) => a.label.localeCompare(b.label));
    if (open.some((n) => !n.labels.some((l) => tags[l]))) cols.push({ key: NO_COL, label: "Untagged", color: null });
    return { cols, mode: "tag" as const, of: (n: TNodeIn) => n.labels.find((l) => tags[l]) ?? NO_COL };
  }
  return {
    cols: [{ key: NO_COL, label: "Items", logo: t?.blueprint.logo, plain: true }],
    mode: "none" as const,
    of: () => NO_COL,
  };
}

export function TechTree() {
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const pid = projectId?.toString();
  const { data: t, error } = useWbTree(pid);
  const { data: items, mutate: refetch, error: itemsError } = usePlaneItems(slug, pid);
  const { data: home } = useWbHome();
  const [sel, setSel] = useState<TSel>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [showCrafted, setShowCrafted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [narrow, setNarrow] = useState(false);
  // the goal card grows with the Tool Cupboard inside it; the tree is laid out on its real height
  const [rootH, setRootH] = useState(300);
  const rootObs = useRef<ResizeObserver | null>(null);
  const [rootMeasured, setRootMeasured] = useState(false);
  const rootRef = useCallback((el: HTMLDivElement | null) => {
    rootObs.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setRootH(el.offsetHeight);
      setRootMeasured(true);
    });
    ro.observe(el);
    rootObs.current = ro;
  }, []);
  const scroller = useRef<HTMLDivElement>(null);
  // the page itself never scrolls: the tree fills the space left under the header (only the map
  // inside it pans and zooms), and Plane's scrolling page frame is locked while the tree is open
  const pageFit = useRef<() => void>(() => {});
  const pageRef = useCallback((el: HTMLDivElement | null) => {
    window.removeEventListener("resize", pageFit.current);
    if (!el) return;
    const frame = el.closest<HTMLElement>(".overflow-y-scroll");
    const fit = () => {
      if (frame) frame.scrollTop = 0;
      el.style.height = `${Math.max(360, window.innerHeight - el.getBoundingClientRect().top - 12)}px`;
    };
    pageFit.current = fit;
    fit();
    window.addEventListener("resize", fit);
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("wb-tree-open");
    return () => {
      document.documentElement.classList.remove("wb-tree-open");
      window.removeEventListener("resize", pageFit.current);
    };
  }, []);
  // the map point under the cursor while wheel-zooming, kept under the cursor after the zoom
  const zoomRef = useRef(1);
  const zoomAnchor = useRef<{ mx: number; my: number; cx: number; cy: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const fitted = useRef<string | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(id);
  }, [flash]);
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);

  useEffect(() => {
    setShowCrafted(readPref("wb:tt:crafted") === "1");
    if (window.innerWidth < 768) setNarrow(true);
  }, []);
  useEffect(() => {
    setSel(null);
    if (pid) writePref("wb:tt:last", pid);
  }, [pid]);

  const tags = t?.labels ?? {};
  const nodesIn = useMemo(() => (items && t ? buildNodes(items, t) : []), [items, t]);
  const all = useMemo(() => new Map(nodesIn.map((n) => [n.id, n])), [nodesIn]);
  const cols = useMemo(() => columnsFor(t, nodesIn), [t, nodesIn]);
  const lay: TLayout | null = useMemo(
    () =>
      t && items
        ? layoutTree(nodesIn, cols.cols, cols.of, showCrafted, { w: narrow ? ROOT_W_NARROW : ROOT_W, h: rootH })
        : null,
    [t, items, nodesIn, cols, showCrafted, narrow, rootH]
  );

  // a new Blueprint opens fitted to the screen (down to a readable size), with its goal in view
  // on the right (once the goal card, which sets the tree's size, has its real height)
  useEffect(() => {
    const el = scroller.current;
    if (!lay || !pid || !el || fitted.current === pid || !rootMeasured) return;
    fitted.current = pid;
    const fitZ = Math.min((el.clientWidth - 48) / lay.width, (el.clientHeight - 48) / lay.height);
    const z = Math.min(1, Math.max(narrow ? 0.6 : 0.5, Math.round(fitZ * 100) / 100));
    zoomAnchor.current = null;
    zoomRef.current = z;
    setZoom(z);
    requestAnimationFrame(() =>
      el.scrollTo({
        left: (lay.goal.x + lay.goal.w) * z + 48 - el.clientWidth,
        top: (lay.goal.y + lay.goal.h / 2) * z + 24 - el.clientHeight / 2,
      })
    );
  }, [lay, pid, narrow, rootMeasured]);

  // the mouse wheel (or a trackpad pinch) zooms around the cursor; drag pans
  const mapReady = !!lay;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = zoomRef.current;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const nz = Math.min(1.5, Math.max(0.2, z * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))));
      if (nz === z) return;
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      zoomAnchor.current = { mx: (el.scrollLeft + cx - 24) / z, my: (el.scrollTop + cy - 24) / z, cx, cy };
      zoomRef.current = nz;
      setZoom(nz);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mapReady]);
  useLayoutEffect(() => {
    const el = scroller.current;
    const a = zoomAnchor.current;
    if (!el || !a) return;
    zoomAnchor.current = null;
    el.scrollLeft = a.mx * zoom + 24 - a.cx;
    el.scrollTop = a.my * zoom + 24 - a.cy;
  }, [zoom]);

  // what to light up: the selected Item's path down to its Kit and the goal, or a whole Kit
  const lit = useMemo(() => {
    if (!lay) return null;
    const focus = hover ?? (sel?.kind === "item" ? sel.id : null);
    const out = new Set<string>();
    const addItem = (id: string) => {
      const p = lay.items.get(id);
      if (!p) return;
      out.add(id);
      out.add(p.col);
    };
    if (focus) {
      const path = pathOf(focus, all);
      // hovering an unlinked Item lights nothing; selecting always shows its way to the goal
      if (hover && path.size < 2 && sel?.id !== hover) return null;
      path.forEach(addItem);
    } else if (sel?.kind === "col") {
      out.add(sel.id);
      for (const p of lay.items.values()) if (p.col === sel.id) out.add(p.id);
    } else return null;
    // the Kits the lit ones lead into, down to the goal
    for (let more = true; more; ) {
      more = false;
      for (const k of lay.kits)
        if (!out.has(k.key) && (k.needs ?? []).some((n) => out.has(n))) {
          out.add(k.key);
          more = true;
        }
    }
    out.add(GOAL);
    return out;
  }, [lay, hover, sel, all]);

  if (error)
    return (
      <WbPage active="blueprints" title="Research tree">
        {<p className="wb-muted">This Blueprint has no tree.</p>}
      </WbPage>
    );
  if (itemsError)
    return (
      <WbPage active="blueprints" title="Research tree">
        {<p className="wb-muted">Couldn't load the Items. Try again.</p>}
      </WbPage>
    );
  if (!t || !lay || !pid)
    return (
      <WbPage active="blueprints" title="Research tree">
        {<p className="wb-muted">Loading the tree…</p>}
      </WbPage>
    );

  const bpHome = home?.blueprints.find((b) => b.id === pid);
  const total = nodesIn.filter((n) => n.group !== "cancelled").length;
  const done = nodesIn.filter((n) => n.group === "completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const placed = [...lay.items.values()];
  const ident = t.blueprint.identifier;
  const learned = total > 0 && done === total;
  const realKits = lay.kits.filter((k) => !k.plain);
  const target = t.blueprint.target ? due(t.blueprint.target, learned ? "completed" : "started") : null;
  const colArt = new Map(cols.cols.map((c) => [c.key, c.logo ?? t.blueprint.logo]));
  const art = (col: string, size: number) => (
    <RustLogo logo={(colArt.get(col) ?? t.blueprint.logo) as TLogo} size={size} />
  );

  const scrollTo = (id: string) => {
    const el = scroller.current;
    const p = lay.items.get(id);
    if (!p || !el) return;
    el.scrollTo({
      left: (p.x + CELL_W / 2) * zoom + 24 - el.clientWidth / 2,
      top: (p.y + ITEM_SQ / 2) * zoom + 24 - el.clientHeight / 2,
      behavior: "smooth",
    });
  };
  // one sound per selection change: the research table opening, or closing when it goes away
  const select = (next: TSel) => {
    if (!next) {
      if (sel) play("research-close");
    } else if (sel?.kind !== next.kind || sel.id !== next.id) play("research-open");
    setSel(next);
  };
  const pick = (id: string) => {
    const n = all.get(id);
    if (!lay.items.has(id) && n?.group === "completed") setShowCrafted(true);
    select({ kind: "item", id });
    setTimeout(() => scrollTo(id), 80);
  };
  const refreshGame = () => {
    for (const ms of [1500, 5000])
      setTimeout(() => void mutateGlobal((k) => typeof k === "string" && k.startsWith("wb:")), ms);
  };
  const onState = async (id: string, group: string) => {
    const sid = t.state_ids?.[group];
    if (!sid || !items) return;
    play(group === "completed" ? "move" : "click");
    await refetch(
      items.map((it) => (it.id === id ? { ...it, state_id: sid, updated_at: new Date().toISOString() } : it)),
      false
    );
    try {
      await setItemState(slug, pid, id, sid);
    } finally {
      void refetch();
      refreshGame();
    }
  };
  const onLink = async (item: string, blocker: string, add: boolean) => {
    if (!items) return;
    await refetch(
      // oxlint-disable-next-line no-map-spread -- a new array for SWR
      items.map((it) =>
        it.id !== item
          ? it
          : {
              ...it,
              issue_relation: add
                ? [...it.issue_relation, { id: blocker, relation_type: "blocked_by", project_id: pid }]
                : it.issue_relation.filter((r) => !(r.id === blocker && r.relation_type === "blocked_by")),
            }
      ),
      false
    );
    try {
      await (add ? addRequirement(slug, pid, item, blocker) : removeRequirement(slug, pid, item, blocker));
    } finally {
      void refetch();
    }
  };
  // does `a` already require `b`, directly or further up its path?
  const requires = (a: string, b: string) => {
    const stack = [a];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === b) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...(all.get(cur)?.blockers ?? []));
    }
    return false;
  };
  const startLink = (from: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const toMap = (cx: number, cy: number) => {
      const r = mapRef.current!.getBoundingClientRect();
      return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
    };
    setLink({ from, ...toMap(e.clientX, e.clientY), over: null });
    const move = (ev: PointerEvent) => {
      const over = nodeAt(ev.clientX, ev.clientY);
      setLink({ from, ...toMap(ev.clientX, ev.clientY), over: over === from ? null : over });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLink(null);
      const to = nodeAt(ev.clientX, ev.clientY);
      if (!to || to === from || all.get(to)?.blockers.includes(from)) return;
      if (requires(from, to)) {
        setFlash("Can't link: that would make a loop");
        return;
      }
      play("move");
      setFlash(`${all.get(to)?.name ?? "Item"} now requires ${all.get(from)?.name ?? "Item"}`);
      void onLink(to, from, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const selItem = sel?.kind === "item" ? all.get(sel.id) : undefined;
  const selKit = sel?.kind === "col" ? lay.kits.find((k) => k.key === sel.id) : undefined;
  const colLabel = (n: TNodeIn) => cols.cols.find((c) => c.key === cols.of(n) && !c.plain)?.label;
  const isLit = (id: string) => !lit || lit.has(id);

  return (
    <WbPage active="blueprints" title={t.blueprint.name}>
      <div className="wb-rt" ref={pageRef}>
        <div className="wb-rt__bar">
          <span className="wb-rt__title">
            <RustLogo logo={t.blueprint.logo} size={26} />
            <b>{t.blueprint.name}</b>
            <span className="wb-rt__pct">
              {done}/{total} · {pct}%
            </span>
          </span>
          <span className="wb-rt__tools">
            <button
              type="button"
              className={cn("wb-rt__tool", showCrafted && "wb-rt__tool--on")}
              aria-pressed={showCrafted}
              onClick={() => {
                setShowCrafted(!showCrafted);
                writePref("wb:tt:crafted", showCrafted ? "0" : "1");
              }}
            >
              <Check className="size-3.5" />
              {showCrafted ? "Hide crafted" : `Show crafted${done ? ` (${done})` : ""}`}
            </button>
            <Link className="wb-tags__link" to={`/${slug}/projects/${pid}/issues/`}>
              List view →
            </Link>
          </span>
        </div>

        <div className="wb-rt__body">
          {home ? <TreeRail slug={slug} current={pid} list={home.blueprints} /> : <nav className="wb-rail" />}
          <div className={cn("wb-rt__wrap", sel && "wb-rt__wrap--panel")}>
            {/* drag on the background pans the map (touch scrolls natively) */}
            {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/click-events-have-key-events */}
            <div
              ref={scroller}
              className="wb-rt__canvas"
              onClick={(e) => {
                if (!drag.current?.moved && !(e.target as HTMLElement).closest(".wb-tc")) select(null);
              }}
              onPointerDown={(e) => {
                if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button,a")) return;
                e.preventDefault(); // a pan never starts a text selection
                window.getSelection()?.removeAllRanges();
                const el = scroller.current!;
                drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || e.buttons !== 1) return;
                if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
                scroller.current!.scrollLeft = d.sl - (e.clientX - d.x);
                scroller.current!.scrollTop = d.st - (e.clientY - d.y);
              }}
              onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
            >
              <div className="wb-rt__size" style={{ width: lay.width * zoom + 48, height: lay.height * zoom + 48 }}>
                <div
                  ref={mapRef}
                  className="wb-rt__map"
                  style={{ width: lay.width, height: lay.height, transform: `scale(${zoom})` }}
                >
                  <svg className="wb-rt__edges" width={lay.width} height={lay.height} aria-hidden>
                    <defs>
                      <marker
                        id="wb-arrow"
                        viewBox="0 0 8 8"
                        refX="7"
                        refY="4"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto"
                      >
                        <path d="M0 0L8 4L0 8z" fill="context-stroke" />
                      </marker>
                    </defs>
                    {lay.wires.map((w) => {
                      const on = !!lit && lit.has(w.from) && lit.has(w.to);
                      return (
                        <g
                          key={w.id}
                          className={cn(
                            "wb-wire",
                            `wb-wire--${w.kind}`,
                            w.done && "wb-wire--done",
                            w.charge && "wb-wire--charge",
                            on && "wb-wire--lit",
                            !!lit && !on && "wb-wire--off"
                          )}
                        >
                          <path d={w.d} markerEnd={w.kind === "extra" ? "url(#wb-arrow)" : undefined} />
                          {w.done && w.kind === "tree" && <path d={w.d} className="wb-wire__spark" />}
                        </g>
                      );
                    })}
                    {link &&
                      (() => {
                        const s = lay.items.get(link.from);
                        if (!s) return null;
                        const sx = s.x + (CELL_W + ITEM_SQ) / 2;
                        const sy = s.y + ITEM_SQ / 2;
                        return (
                          <path
                            d={`M${sx} ${sy}C${sx + 60} ${sy},${link.x - 60} ${link.y},${link.x} ${link.y}`}
                            className="wb-wire--drag"
                            markerEnd="url(#wb-arrow)"
                          />
                        );
                      })()}
                  </svg>

                  {lay.kits.map((k) => (
                    <KitTile
                      key={k.key}
                      k={k}
                      art={
                        k.color !== undefined ? (
                          <RustLogo logo={t.blueprint.logo} size={60} />
                        ) : (
                          <RustLogo logo={k.logo as TLogo} size={60} />
                        )
                      }
                      sel={sel?.kind === "col" && sel.id === k.key}
                      dim={!isLit(k.key)}
                      onSelect={() => select({ kind: "col", id: k.key })}
                    />
                  ))}

                  {placed.map((p) => (
                    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover only lights the path
                    <div key={p.id} onMouseEnter={() => !link && setHover(p.id)} onMouseLeave={() => setHover(null)}>
                      <ItemTile
                        p={p}
                        art={art(p.col, 44)}
                        sel={sel?.kind === "item" && sel.id === p.id}
                        dim={!isLit(p.id)}
                        onSelect={() => select({ kind: "item", id: p.id })}
                        onLinkStart={(e) => startLink(p.id, e)}
                        linkTarget={link?.over === p.id}
                      />
                    </div>
                  ))}

                  {/* the goal: the Blueprint, with its Tool Cupboard */}
                  <div
                    ref={rootRef}
                    className={cn(
                      "wb-goal",
                      learned && "wb-goal--learned",
                      target?.late && "wb-goal--late",
                      sel?.kind === "root" && "wb-goal--sel"
                    )}
                    style={{ left: lay.goal.x, top: lay.goal.y, width: lay.goal.w }}
                  >
                    <button
                      type="button"
                      className="wb-goal__main"
                      onClick={(e) => {
                        e.stopPropagation();
                        select({ kind: "root", id: pid });
                      }}
                    >
                      <span className="wb-goal__ic">
                        <RustLogo logo={t.blueprint.logo} size={56} />
                        {learned && <Tick />}
                      </span>
                      <span className="wb-goal__tx">
                        <small>
                          <Flag className="size-3" />
                          {learned ? "Blueprint learned" : "Blueprint"}
                          {target && ` · target ${target.label}`}
                        </small>
                        <b>{t.blueprint.name}</b>
                        {realKits.length ? (
                          <span className="wb-goal__pips">
                            {realKits.map((k) => (
                              <i key={k.key} className={`wb-goal__pip--${k.state}`} title={k.label} />
                            ))}
                            <em>
                              {realKits.filter((k) => k.state === "done").length}/{realKits.length} Kits · {done}/
                              {total}
                            </em>
                          </span>
                        ) : (
                          <span className="wb-goal__pips">
                            <span className="wb-bar">
                              <i style={{ width: `${pct}%` }} />
                            </span>
                            <em>
                              {done}/{total}
                            </em>
                          </span>
                        )}
                      </span>
                    </button>
                    {bpHome && <ToolCupboardPanel bp={bpHome} />}
                  </div>

                  {!placed.length && !lay.kits.length && (
                    <p className="wb-rt__empty" style={{ left: lay.goal.x, top: Math.max(0, lay.goal.y - 44) }}>
                      {total
                        ? "Everything here is crafted. Show crafted to see the whole tree."
                        : "No Items yet. Add Items to this Blueprint."}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {flash && (
              <div className="wb-rt__flash" role="status">
                {flash}
              </div>
            )}
            {!sel && !flash && (
              <div className="wb-rt__hint">
                <Link2 className="size-3.5" />
                Scroll to zoom · drag a tile's handle onto an Item it unlocks
              </div>
            )}
            {selItem && (
              <ItemPanel
                n={selItem}
                all={all}
                tags={tags}
                colLabel={colLabel(selItem)}
                slug={slug}
                pid={pid}
                ident={ident}
                stateIds={t.state_ids ?? {}}
                onPick={pick}
                onClose={() => select(null)}
                onState={(id, g) => void onState(id, g)}
                onLink={(a, b, add) => void onLink(a, b, add)}
              />
            )}
            {selKit && (
              <SummaryPanel
                title={selKit.label}
                icon={<RustLogo logo={(selKit.logo ?? t.blueprint.logo) as TLogo} size={56} />}
                kicker={cols.mode === "kit" && selKit.key !== NO_COL ? "Kit" : "Group"}
                items={nodesIn.filter((n) => cols.of(n) === selKit.key)}
                isReady={(n) => lay.items.get(n.id)?.state === "ready"}
                done={selKit.done}
                total={selKit.total}
                onPick={pick}
                onClose={() => select(null)}
                links={
                  cols.mode === "kit" && selKit.key !== NO_COL ? (
                    <Link className="wb-btn wb-btn--ghost" to={`/${slug}/projects/${pid}/modules/${selKit.key}`}>
                      Open Kit
                    </Link>
                  ) : null
                }
              />
            )}
            {sel?.kind === "root" && (
              <SummaryPanel
                title={t.blueprint.name}
                icon={<RustLogo logo={t.blueprint.logo} size={56} />}
                kicker="Blueprint"
                items={nodesIn}
                isReady={(n) => lay.items.get(n.id)?.state === "ready"}
                done={done}
                total={total}
                onPick={pick}
                onClose={() => select(null)}
                links={
                  <Link className="wb-btn wb-btn--ghost" to={`/${slug}/projects/${pid}/issues/`}>
                    List view
                  </Link>
                }
              />
            )}
          </div>
        </div>
      </div>
    </WbPage>
  );
}
