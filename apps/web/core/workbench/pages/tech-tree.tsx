/**
 * A Blueprint's tech tree, after Rust's research tree: the Blueprint at the top, its Kits
 * as research steps on olive wires, each with progress and its next Items. Crafted steps
 * are lit, locked ones (waiting on another Kit) carry a padlock, and the next step has the
 * breathing corner bracket. Under the tree, every Item in a crafting list: grouped by
 * status, tag, Kit or grade, with its attributes. Clicking a Kit filters the list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Circle, Hammer, Lock, X } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import type { TTag, TTree, TTreeItem, TTreeKit } from "../lib/api";
import { sortedBy, useWbHome, useWbTree } from "../lib/api";
import { RustItem, RustLogo } from "../components/rust-icon";
import { ToolCupboard } from "./server-browser";
import { WbPage } from "./shell";

const STATUS: Record<string, { label: string; rank: number }> = {
  started: { label: "Crafting", rank: 0 },
  unstarted: { label: "To craft", rank: 1 },
  backlog: { label: "Locked", rank: 2 },
  completed: { label: "Crafted", rank: 3 },
  cancelled: { label: "Scrapped", rank: 4 },
};
// building grades, with the resource Rust asks for to build at that grade
const GRADE: Record<string, { label: string; icon: string; rank: number }> = {
  urgent: { label: "Armored", icon: "metal.refined", rank: 0 },
  high: { label: "Sheet Metal", icon: "metal.fragments", rank: 1 },
  medium: { label: "Stone", icon: "stones", rank: 2 },
  low: { label: "Wood", icon: "wood", rank: 3 },
  none: { label: "Twig", icon: "building.planner", rank: 4 },
};
const HP = [100, 65, 35, 12];
const CLOSED = new Set(["completed", "cancelled"]);

type TGroupBy = "status" | "tag" | "kit" | "grade";
type TGroup = { key: string; label: string; icon?: React.ReactNode; color?: string | null; items: TTreeItem[] };

const rank = (it: TTreeItem) => STATUS[it.group]?.rank ?? 5;
const grade = (it: TTreeItem) => GRADE[it.priority ?? "none"] ?? GRADE.none;

function StatusIcon({ group }: { group: string }) {
  const Icon = { started: Hammer, unstarted: Circle, backlog: Lock, completed: Check, cancelled: X }[group] ?? Circle;
  return (
    <span className={cn("wb-st", `wb-st--${group}`)} aria-label={STATUS[group]?.label}>
      <Icon className="size-3" strokeWidth={2.5} />
    </span>
  );
}

function dueText(target?: string | null) {
  if (!target) return null;
  const d = new Date(`${target}T00:00:00`);
  const days = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return { label, late: days < 0, soon: days >= 0 && days <= 3 };
}

function ItemRow({
  it,
  ident,
  slug,
  tags,
  kits,
  showKit,
  showTags,
}: {
  it: TTreeItem;
  ident: string;
  slug: string;
  tags: Record<string, TTag>;
  kits: Record<string, TTreeKit>;
  showKit: boolean;
  showTags: boolean;
}) {
  const g = grade(it);
  const due = CLOSED.has(it.group) ? null : dueText(it.target);
  const kit = showKit ? (it.kits ?? []).map((k) => kits[k]).find(Boolean) : undefined;
  return (
    <Link
      to={`/${slug}/browse/${ident}-${it.seq}/`}
      className={cn("wb-row", `wb-row--${it.group}`, it.decay > 0 && `wb-row--decay${it.decay}`)}
    >
      <StatusIcon group={it.group} />
      <span className="wb-row__key">
        {ident}-{it.seq}
      </span>
      <span className="wb-row__name">
        {it.name}
        {!!it.components && <small className="wb-row__comp">{it.components} components</small>}
      </span>
      <span className="wb-row__meta">
        {it.group === "started" && it.decay > 0 && (
          <Tooltip tooltipContent="Decaying: no activity for a while">
            <span className="wb-row__hp">
              <i style={{ width: `${HP[it.decay]}%` }} />
            </span>
          </Tooltip>
        )}
        {(showTags ? (it.labels ?? []) : [])
          .map((id) => tags[id])
          .filter(Boolean)
          .map((t) => (
            <span key={t.name} className="wb-pill">
              <i style={{ background: t.color ?? undefined }} />
              {t.name}
            </span>
          ))}
        {kit && (
          <span className="wb-pill wb-pill--kit">
            <RustLogo logo={kit.logo} size={14} />
            {kit.name}
          </span>
        )}
        {due && (
          <span className={cn("wb-pill", due.late && "wb-pill--late", due.soon && "wb-pill--soon")}>{due.label}</span>
        )}
        <Tooltip tooltipContent={`Grade: ${g.label}`}>
          <span className={cn("wb-grade", `wb-grade--${it.priority ?? "none"}`)}>
            <RustItem item={g.icon} size={18} />
            <span>{g.label}</span>
          </span>
        </Tooltip>
      </span>
    </Link>
  );
}

function groupItems(items: TTreeItem[], by: TGroupBy, tags: Record<string, TTag>, kits: TTreeKit[]): TGroup[] {
  const groups = new Map<string, TGroup>();
  const add = (key: string, make: () => Omit<TGroup, "items" | "key">, it: TTreeItem) => {
    if (!groups.has(key)) groups.set(key, { key, items: [], ...make() });
    groups.get(key)!.items.push(it);
  };
  for (const it of items) {
    if (by === "status") {
      add(it.group, () => ({ label: STATUS[it.group]?.label ?? it.group, icon: <StatusIcon group={it.group} /> }), it);
      continue;
    }
    if (it.group === "cancelled") continue; // Scrapped only shows when grouped by status
    if (by === "grade") {
      const g = grade(it);
      add(g.label, () => ({ label: g.label, icon: <RustItem item={g.icon} size={18} /> }), it);
    } else if (by === "tag") {
      const id = (it.labels ?? []).find((l) => tags[l]);
      add(id ?? "~", () => (id ? { label: tags[id].name, color: tags[id].color } : { label: "Untagged" }), it);
    } else {
      const k = kits.find((kk) => (it.kits ?? []).includes(kk.id));
      add(
        k?.id ?? "~",
        () => (k ? { label: k.name, icon: <RustLogo logo={k.logo} size={18} /> } : { label: "No Kit" }),
        it
      );
    }
  }
  const list = [...groups.values()];
  for (const g of list) g.items = sortedBy(g.items, (it) => rank(it) * 10 + grade(it).rank);
  const order = (g: TGroup) => {
    if (g.key === "~") return 1e6;
    if (by === "status") return STATUS[g.key]?.rank ?? 9;
    if (by === "grade") return Object.values(GRADE).find((x) => x.label === g.key)?.rank ?? 9;
    if (by === "kit") return kits.findIndex((k) => k.id === g.key);
    return 0;
  };
  const sorted = sortedBy(list, order);
  if (by !== "tag") return sorted;
  const tagged = sorted.filter((g) => g.key !== "~");
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a fresh copy
  tagged.sort((a, b) => a.label.localeCompare(b.label));
  return [...tagged, ...sorted.filter((g) => g.key === "~")];
}

function readPref(key: string): string | null {
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
    /* private mode: not remembered */
  }
}

function CraftList({
  data,
  kitsById,
  kit,
  onClearKit,
  slug,
  pid,
}: {
  data: TTree;
  kitsById: Record<string, TTreeKit>;
  kit: TTreeKit | null;
  onClearKit: () => void;
  slug: string;
  pid: string;
}) {
  const tags = data.labels ?? {};
  const all = data.items ?? [...data.kits.flatMap((k) => k.items), ...data.loose];
  const hasTags = all.some((it) => (it.labels ?? []).some((l) => tags[l]));
  const options: Array<[TGroupBy, string]> = [
    ["status", "Status"],
    ...(hasTags ? ([["tag", "Tag"]] as Array<[TGroupBy, string]>) : []),
    ...(data.kits.length ? ([["kit", "Kit"]] as Array<[TGroupBy, string]>) : []),
    ["grade", "Grade"],
  ];
  const prefKey = `wb:tt:group:${pid}`;
  const fallback: TGroupBy = !data.kits.length && hasTags ? "tag" : "status";
  const [by, setBy] = useState<TGroupBy>(fallback);
  useEffect(() => {
    const saved = readPref(prefKey) as TGroupBy | null;
    setBy(saved && options.some(([k]) => k === saved) ? saved : fallback);
    // options only change with the data
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey, fallback]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const items = kit ? all.filter((it) => (it.kits ?? []).includes(kit.id)) : all;
  const groups = groupItems(items, by, tags, data.kits);
  const isOpen = (g: TGroup) => open[g.key] ?? !(by === "status" && CLOSED.has(g.key));

  return (
    <section className="wb-list" aria-label="Items">
      <header className="wb-list__bar">
        <h3>{kit ? "Kit items" : "Items"}</h3>
        {kit && (
          <span className="wb-list__kit">
            <RustLogo logo={kit.logo} size={18} />
            <b>{kit.name}</b>
            <Link to={`/${slug}/projects/${pid}/modules/${kit.id}`}>Open Kit</Link>
            <button type="button" onClick={onClearKit} aria-label="Show all Items">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <span className="wb-seg" role="group" aria-label="Group by">
          {options.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={cn(by === k && "wb-seg--on")}
              aria-pressed={by === k}
              onClick={() => {
                setBy(k);
                writePref(prefKey, k);
              }}
            >
              {label}
            </button>
          ))}
        </span>
      </header>
      {groups.map((g) => {
        const done = g.items.filter((it) => it.group === "completed").length;
        const shut = !isOpen(g);
        return (
          <div key={g.key} className="wb-list__group">
            <button
              type="button"
              className="wb-list__hd"
              aria-expanded={!shut}
              onClick={() => setOpen({ ...open, [g.key]: shut })}
            >
              <ChevronRight className={cn("wb-list__chev size-3.5", !shut && "wb-list__chev--open")} />
              {g.icon ?? <i className="wb-list__dot" style={{ background: g.color ?? undefined }} />}
              <span>{g.label}</span>
              <b>{by === "status" ? g.items.length : `${done}/${g.items.length}`}</b>
            </button>
            {!shut &&
              g.items.map((it) => (
                <ItemRow
                  key={it.id}
                  it={it}
                  ident={data.blueprint.identifier}
                  slug={slug}
                  tags={tags}
                  kits={kitsById}
                  showKit={by !== "kit" && !kit}
                  showTags={by !== "tag"}
                />
              ))}
          </div>
        );
      })}
      {!items.length && <p className="wb-muted">No Items here yet.</p>}
    </section>
  );
}

function KitNode({
  kit,
  next,
  selected,
  onSelect,
}: {
  kit: TTreeKit;
  next: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const open = sortedBy(
    kit.items.filter((it) => !CLOSED.has(it.group)),
    rank
  );
  const count = (g: string) => kit.items.filter((it) => it.group === g).length;
  const pct = kit.total ? (kit.done / kit.total) * 100 : 0;
  return (
    <div className={cn("wb-tt-col", `wb-tt-col--${kit.state}`, selected && "wb-tt-col--sel")}>
      <button
        type="button"
        className={cn("wb-tt-kit", next && "wb-tt-kit--next")}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${kit.name}: show its Items`}
      >
        {next && <span className="wb-brk" aria-hidden />}
        <RustLogo logo={kit.logo} size={46} />
        {kit.state === "locked" && (
          <span className="wb-tt-kit__lock">
            <Lock className="size-4" />
          </span>
        )}
      </button>
      <button type="button" className="wb-tt-card" onClick={onSelect}>
        <span className="wb-tt-card__name">{kit.name}</span>
        <span className="wb-tt-card__bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="wb-tt-card__counts">
          <span>
            {kit.done}/{kit.total} crafted
          </span>
          {!!count("started") && <span className="wb-tt-card__c--started">{count("started")} crafting</span>}
        </span>
        {open.slice(0, 3).map((it) => (
          <span key={it.id} className={cn("wb-tt-card__item", `wb-tt-card__item--${it.group}`)}>
            <StatusIcon group={it.group} />
            <span>{it.name}</span>
          </span>
        ))}
        {open.length > 3 && <span className="wb-tt-card__more">+{open.length - 3} more</span>}
      </button>
    </div>
  );
}

// next / crafting first, crafted last: the tree reads left to right like a plan
function kitOrder(k: TTreeKit) {
  return { crafting: 0, "to-craft": 1, locked: 2, crafted: 3 }[k.state];
}

export function TechTree() {
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const pid = projectId?.toString();
  const { data, error } = useWbTree(pid);
  const { data: home } = useWbHome();
  const [tc, setTc] = useState(false);
  const [kitId, setKitId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bpHome = home?.blueprints.find((b) => b.id === pid);
  const kitsById = useMemo(() => Object.fromEntries((data?.kits ?? []).map((k) => [k.id, k])), [data?.kits]);

  if (error) return <WbPage title="Tech tree">{<p className="wb-muted">This Blueprint has no tree.</p>}</WbPage>;
  if (!data || !pid) return <WbPage title="Tech tree">{<p className="wb-muted">Loading the tree…</p>}</WbPage>;

  const kits = sortedBy(data.kits, kitOrder);
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  const select = (id: string) => {
    setKitId(kitId === id ? null : id);
    if (kitId !== id)
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
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
                Board view →
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
                  selected={k.id === kitId}
                  onSelect={() => select(k.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={listRef} className="wb-tt__list">
          <CraftList
            data={data}
            kitsById={kitsById}
            kit={kitId ? (kitsById[kitId] ?? null) : null}
            onClearKit={() => setKitId(null)}
            slug={slug}
            pid={pid}
          />
        </div>
      </div>
      {tc && bpHome && <ToolCupboard bp={bpHome} onClose={() => setTc(false)} />}
    </WbPage>
  );
}
