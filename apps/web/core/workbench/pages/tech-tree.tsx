/**
 * A Blueprint's research tree, after Rust's tech tree: the Blueprint at the top, a column
 * per Kit on olive wires, and every Item as its own block, hanging under what it requires
 * (or the Item it is a Component of). Lines show the way to each Kit and to the Blueprint.
 * Selecting a block lights up its whole path and opens the research panel: details,
 * requirements, what it unlocks, and the buttons to start, craft and link Items.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, Hammer, Link2, Lock, Minus, Plus, Search, X } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { mutate as mutateGlobal } from "swr";
import { cn } from "@plane/utils";
import type { TLogo, TTag, TTree } from "../lib/api";
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
import type { TCol, TColIn, TLayout, TNodeIn, TPlaced } from "../lib/tree-layout";
import { HEADER_H, HEADER_W, NODE_H, NODE_W, layoutTree, pathOf } from "../lib/tree-layout";
import { play } from "../sound/engine";
import { RustItem, RustLogo } from "../components/rust-icon";
import { CupboardStrip } from "./server-browser";
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

// ---------------------------------------------------------------- nodes

function ItemNode({
  p,
  tags,
  sel,
  dim,
  onSelect,
  onLinkStart,
  linkTarget,
}: {
  p: TPlaced;
  tags: Record<string, TTag>;
  sel: boolean;
  dim: boolean;
  onSelect: () => void;
  onLinkStart: (e: React.PointerEvent) => void;
  linkTarget: boolean;
}) {
  const g = GRADE[p.priority] ?? GRADE.none;
  const d = due(p.target, p.group);
  const tagList = p.labels.map((l) => tags[l]).filter(Boolean);
  const blocked = p.blocked && p.group !== "completed";
  return (
    <button
      type="button"
      className={cn(
        "wb-node",
        `wb-node--${p.group}`,
        blocked && "wb-node--blocked",
        p.ready && "wb-node--ready",
        p.decay > 0 && `wb-node--decay${p.decay}`,
        sel && "wb-node--sel",
        dim && "wb-node--dim",
        linkTarget && "wb-node--target"
      )}
      data-node={p.id}
      style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={sel}
    >
      <span className="wb-node__top">
        <StatusIcon group={p.group} />
        <span className="wb-node__key">#{p.seq}</span>
        {blocked && (
          <span className="wb-node__lock" title="Requires other Items first">
            <Link2 className="size-3" /> Needs
          </span>
        )}
        {p.ready && <span className="wb-node__ready">Ready</span>}
        <span className="wb-node__grade" title={`Grade: ${g.label}`}>
          <RustItem item={g.icon} size={20} />
        </span>
      </span>
      <span className="wb-node__name">{p.name}</span>
      <span className="wb-node__meta">
        {tagList.slice(0, 3).map((tg) => (
          <i key={tg.name} className="wb-node__tag" style={{ background: tg.color ?? undefined }} title={tg.name} />
        ))}
        {!!p.components && (
          <span className="wb-node__comp" title="Components crafted">
            ⚙ {p.componentsDone}/{p.components}
          </span>
        )}
        {d && (
          <span className={cn("wb-node__due", d.late && "wb-node__due--late", d.soon && "wb-node__due--soon")}>
            {d.label}
          </span>
        )}
        {p.group === "started" && (
          <span className="wb-node__hp" title={p.decay ? "Decaying: no activity for a while" : "Crafting"}>
            <i style={{ width: `${HP[p.decay]}%` }} />
          </span>
        )}
      </span>
      {/* drag from here onto another Item: "this unlocks that" */}
      <span
        className="wb-node__port"
        role="presentation"
        title="Drag onto an Item this one unlocks"
        onPointerDown={onLinkStart}
        onClick={(e) => e.stopPropagation()}
      />
    </button>
  );
}

function ColIcon({ c, size }: { c: { color?: string | null; logo?: unknown }; size: number }) {
  return c.color !== undefined ? (
    <i className="wb-colhd__dot" style={{ background: c.color ?? undefined }} />
  ) : (
    <RustLogo logo={c.logo as TLogo} size={size} />
  );
}

function ColHeader({ c, sel, dim, onSelect }: { c: TCol; sel: boolean; dim: boolean; onSelect: () => void }) {
  const pct = c.total ? (c.done / c.total) * 100 : 0;
  return (
    <button
      type="button"
      className={cn("wb-colhd", `wb-colhd--${c.state}`, sel && "wb-colhd--sel", dim && "wb-node--dim")}
      style={{ left: c.x, width: HEADER_W, height: HEADER_H }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={sel}
    >
      <span className="wb-colhd__icon">
        <ColIcon c={c} size={44} />
        {c.state === "locked" && (
          <span className="wb-colhd__lock">
            <Lock className="size-4" />
          </span>
        )}
      </span>
      <span className="wb-colhd__body">
        <span className="wb-colhd__name">{c.label}</span>
        <span className="wb-colhd__bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="wb-colhd__counts">
          <span>
            {c.done}/{c.total}
          </span>
          {!!c.crafting && <span className="wb-colhd__crafting">{c.crafting} crafting</span>}
          {c.state === "crafted" && <span className="wb-colhd__learned">Learned</span>}
        </span>
      </span>
    </button>
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
  done,
  total,
  links,
  onPick,
  onClose,
}: {
  title: string;
  icon: React.ReactNode;
  kicker: string;
  items: TPlaced[];
  done: number;
  total: number;
  links: React.ReactNode;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const crafting = items.filter((p) => p.group === "started");
  const ready = items.filter((p) => p.ready);
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
      <div className="wb-colhd__bar">
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

function readPref(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, v: string) {
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
    const cols: TColIn[] = kits.map((k) => ({ key: k.id, label: k.name, logo: k.logo }));
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
  return { cols: [{ key: NO_COL, label: "Items", logo: t?.blueprint.logo }], mode: "none" as const, of: () => NO_COL };
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
  const scroller = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
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
    if (window.innerWidth < 768) {
      setZoom(0.8);
      setNarrow(true);
    }
  }, []);
  useEffect(() => setSel(null), [pid]);

  const tags = t?.labels ?? {};
  const nodesIn = useMemo(() => (items && t ? buildNodes(items, t) : []), [items, t]);
  const all = useMemo(() => new Map(nodesIn.map((n) => [n.id, n])), [nodesIn]);
  const cols = useMemo(() => columnsFor(t, nodesIn), [t, nodesIn]);
  const lay: TLayout | null = useMemo(
    () => (t && items ? layoutTree(nodesIn, cols.cols, cols.of, showCrafted, narrow) : null),
    [t, items, nodesIn, cols, showCrafted, narrow]
  );

  const focusId = hover ?? (sel?.kind === "item" ? sel.id : null);
  // light up a path only when there is one (an Item with links)
  const lit = useMemo(() => {
    if (!focusId) return null;
    const path = pathOf(focusId, all);
    return path.size > 1 ? path : null;
  }, [focusId, all]);
  const colLit = sel?.kind === "col" ? sel.id : null;

  if (error) return <WbPage title="Tech tree">{<p className="wb-muted">This Blueprint has no tree.</p>}</WbPage>;
  if (itemsError)
    return <WbPage title="Tech tree">{<p className="wb-muted">Couldn't load the Items. Try again.</p>}</WbPage>;
  if (!t || !lay || !pid) return <WbPage title="Tech tree">{<p className="wb-muted">Loading the tree…</p>}</WbPage>;

  const bpHome = home?.blueprints.find((b) => b.id === pid);
  const total = nodesIn.filter((n) => n.group !== "cancelled").length;
  const done = nodesIn.filter((n) => n.group === "completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const placed = [...lay.nodes.values()];
  const ident = t.blueprint.identifier;

  const scrollTo = (id: string) => {
    const el = scroller.current;
    const p = lay.nodes.get(id);
    if (!p || !el) return;
    el.scrollTo({ left: p.x * zoom - 40, top: p.y * zoom - el.clientHeight / 3, behavior: "smooth" });
  };
  // one sound per selection change: the research table opening, or closing when it goes away
  const select = (next: TSel) => {
    if (!next) {
      if (sel) play("research-close");
    } else if (sel?.kind !== next.kind || sel.id !== next.id) play("research-open");
    setSel(next);
  };
  const pick = (id: string) => {
    if (!lay.nodes.has(id) && all.get(id)?.group === "completed") setShowCrafted(true);
    select({ kind: "item", id });
    setTimeout(() => scrollTo(id), 60);
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
  const setZoomClamped = (z: number) => setZoom(Math.min(1.3, Math.max(0.35, Math.round(z * 100) / 100)));
  const fit = () => {
    const el = scroller.current;
    if (el) setZoomClamped(zoom === 1 ? Math.min(1, (el.clientWidth - 24) / lay.width) : 1);
  };

  const selItem = sel?.kind === "item" ? all.get(sel.id) : undefined;
  const selCol = sel?.kind === "col" ? lay.cols.find((c) => c.key === sel.id) : undefined;
  const colLabel = (n: TNodeIn) => lay.cols.find((c) => c.key === cols.of(n))?.label;

  // the wires from the Blueprint down to every column
  const rootX = 40;
  const lastX = lay.cols.length ? lay.cols[lay.cols.length - 1].x + HEADER_W / 2 : rootX;
  const busD =
    `M${rootX} ${lay.root.h}V${lay.busY}H${Math.max(lastX, rootX)}` +
    lay.cols.map((c) => `M${c.x + HEADER_W / 2} ${lay.busY}V${lay.headerY}`).join("");

  return (
    <WbPage title={t.blueprint.name}>
      <div className="wb-rt">
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
            <span className="wb-rt__zoom">
              <button type="button" onClick={() => setZoomClamped(zoom - 0.15)} aria-label="Zoom out">
                <Minus className="size-3.5" />
              </button>
              <button type="button" onClick={fit} className="wb-rt__fit" title="Fit / 100%">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={() => setZoomClamped(zoom + 0.15)} aria-label="Zoom in">
                <Plus className="size-3.5" />
              </button>
            </span>
            <Link className="wb-tags__link" to={`/${slug}/projects/${pid}/issues/`}>
              List view →
            </Link>
          </span>
        </div>

        <div className={cn("wb-rt__wrap", sel && "wb-rt__wrap--panel")}>
          {/* drag on the background pans the map (touch scrolls natively) */}
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/click-events-have-key-events */}
          <div
            ref={scroller}
            className="wb-rt__canvas"
            onClick={(e) => {
              if (!drag.current?.moved && !(e.target as HTMLElement).closest(".wb-cup")) select(null);
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button,a")) return;
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
                  <path d={busD} className="wb-edge wb-edge--bus" />
                  {link &&
                    (() => {
                      const s = lay.nodes.get(link.from);
                      if (!s) return null;
                      const sx = s.x + NODE_W / 2;
                      const sy = s.y + NODE_H;
                      return (
                        <path
                          d={`M${sx} ${sy}C${sx} ${sy + 60},${link.x} ${link.y - 60},${link.x} ${link.y}`}
                          className="wb-edge wb-edge--drag"
                          markerEnd="url(#wb-arrow)"
                        />
                      );
                    })()}
                  {lay.edges.map((e) => {
                    const on = lit
                      ? lit.has(e.from) && lit.has(e.to)
                      : colLit
                        ? lay.nodes.get(e.to)?.col === colLit
                        : false;
                    const off = (!!lit || !!colLit) && !on;
                    return (
                      <path
                        key={e.id}
                        d={e.d}
                        className={cn(
                          "wb-edge",
                          `wb-edge--${e.kind}`,
                          e.done && "wb-edge--done",
                          on && "wb-edge--lit",
                          off && "wb-edge--off"
                        )}
                        markerEnd={e.kind === "extra" ? "url(#wb-arrow)" : undefined}
                      />
                    );
                  })}
                </svg>

                <div
                  className={cn("wb-rt-root", narrow && "wb-rt-root--stacked", sel?.kind === "root" && "wb-colhd--sel")}
                  style={{ width: lay.root.w, height: lay.root.h }}
                >
                  <button
                    type="button"
                    className="wb-rt-root__main"
                    onClick={(e) => {
                      e.stopPropagation();
                      select({ kind: "root", id: pid });
                    }}
                  >
                    <span className="wb-rt-root__icon">
                      <RustLogo logo={t.blueprint.logo} size={56} />
                    </span>
                    <span className="wb-colhd__body">
                      <small>{done === total && total ? "Blueprint learned" : "Blueprint"}</small>
                      <span className="wb-colhd__name">{t.blueprint.name}</span>
                      <span className="wb-colhd__bar">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </button>
                  {bpHome && <CupboardStrip bp={bpHome} />}
                </div>

                <div className="wb-rt__cols" style={{ top: lay.headerY }}>
                  {lay.cols.map((c) => (
                    <ColHeader
                      key={c.key}
                      c={c}
                      sel={sel?.kind === "col" && sel.id === c.key}
                      dim={!!lit}
                      onSelect={() => select({ kind: "col", id: c.key })}
                    />
                  ))}
                </div>

                {placed.map((p) => (
                  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover only lights the path
                  <div key={p.id} onMouseEnter={() => !link && setHover(p.id)} onMouseLeave={() => setHover(null)}>
                    <ItemNode
                      p={p}
                      tags={tags}
                      sel={sel?.kind === "item" && sel.id === p.id}
                      dim={(!!lit && !lit.has(p.id)) || (!!colLit && p.col !== colLit)}
                      onSelect={() => select({ kind: "item", id: p.id })}
                      onLinkStart={(e) => startLink(p.id, e)}
                      linkTarget={link?.over === p.id}
                    />
                  </div>
                ))}

                {!placed.length && (
                  <p className="wb-rt__empty" style={{ top: lay.headerY + HEADER_H + 30 }}>
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
              Drag the handle under a block onto an Item it unlocks
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
          {selCol && (
            <SummaryPanel
              title={selCol.label}
              icon={<ColIcon c={selCol} size={56} />}
              kicker={cols.mode === "kit" && selCol.key !== NO_COL ? "Kit" : "Group"}
              items={placed.filter((p) => p.col === selCol.key)}
              done={selCol.done}
              total={selCol.total}
              onPick={pick}
              onClose={() => select(null)}
              links={
                cols.mode === "kit" && selCol.key !== NO_COL ? (
                  <Link className="wb-btn wb-btn--ghost" to={`/${slug}/projects/${pid}/modules/${selCol.key}`}>
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
              items={placed}
              done={done}
              total={total}
              onPick={pick}
              onClose={() => select(null)}
              links={
                <>
                  <Link className="wb-btn wb-btn--ghost" to={`/${slug}/projects/${pid}/issues/`}>
                    List view
                  </Link>
                </>
              }
            />
          )}
        </div>
      </div>
    </WbPage>
  );
}
