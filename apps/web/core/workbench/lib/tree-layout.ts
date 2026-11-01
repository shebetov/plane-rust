/* oxlint-disable unicorn/no-array-sort -- every sort here is on a fresh copy (the app targets ES2022, no toSorted) */
/**
 * Lays out a Blueprint as a path to its goal, after the Thesys map and Rust's tech tree,
 * read left to right: the Blueprint (the goal) on the right, its Kits in a column left of it,
 * and each Kit's Items left of the Kit. Whatever leads to something sits left of it and is
 * wired right into it:
 * - an Item required by another Item (or a Component of it) sits left of that Item;
 * - an Item that leads to nothing else in its Kit is wired into the Kit;
 * - a Kit that needs another Kit has that Kit left of it; the rest are wired into the goal.
 * Items with no links are wired straight into their Kit, one under another. Any other
 * requirement is drawn as a dashed arrow. Positions are plain numbers in map pixels.
 */
export type TNodeIn = {
  id: string;
  name: string;
  seq: number;
  group: string; // backlog | unstarted | started | completed | cancelled
  priority: string;
  target: string | null;
  decay: number;
  parent: string | null;
  labels: string[];
  kits: string[];
  components: number;
  blockers: string[]; // Items this one requires (ids in this Blueprint)
};
/** A Kit, a tag group, or (`plain`) the one group of a Blueprint with neither: no tile of its own */
export type TColIn = {
  key: string;
  label: string;
  logo?: unknown;
  color?: string | null;
  needs?: string[];
  plain?: boolean;
};

export type TState = "done" | "active" | "ready" | "locked" | "backlog";

export type TItemTile = TNodeIn & {
  kind: "item";
  col: string;
  x: number;
  y: number;
  state: TState;
  next: boolean;
  componentsDone: number;
};
export type TKitTile = TColIn & {
  kind: "kit";
  id: string;
  x: number;
  y: number;
  state: TState;
  done: number;
  total: number;
  crafting: number;
  hidden: number;
};
export type TWire = {
  id: string;
  from: string;
  to: string;
  d: string;
  kind: "tree" | "extra";
  done: boolean;
  charge: boolean;
};
export type TLayout = {
  items: Map<string, TItemTile>;
  kits: TKitTile[];
  wires: TWire[];
  goal: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
  /** the next Item to craft in this Blueprint */
  next: string | null;
};

export const GOAL = "goal";
export const CELL_W = 112;
export const ITEM_SQ = 62;
const CELL_H = 118; // tile, then a label of up to three lines
export const KIT_W = 124;
export const KIT_SQ = 84;
const KIT_H = 140;
const DEPTH_GAP = 56; // from a tile across to what it leads to (room for the wire's turn)
const STACK_GAP = 10; // between siblings, one above the other
const PAD = 24;
/** the Blueprint card (its name with the Tool Cupboard under it); the page passes its measured height */
export const ROOT_W = 374;
export const ROOT_W_NARROW = 330;

const CLOSED = new Set(["completed", "cancelled"]);
const RANK: Record<string, number> = { started: 0, unstarted: 1, backlog: 2, completed: 3, cancelled: 4 };
const GRADE: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const STATE_RANK: Record<TState, number> = { active: 0, ready: 1, locked: 2, backlog: 3, done: 4 };

type LNode = {
  key: string;
  kind: "goal" | "kit" | "item";
  w: number;
  h: number;
  kids: LNode[];
  span: number; // height of the subtree
  deep: number; // width of the subtree, from its leftmost tile to this node's right edge
  x: number;
  y: number;
  cy: number; // where wires meet it
};

function leaf(key: string, kind: LNode["kind"], w: number, h: number): LNode {
  return {
    key,
    kind,
    w,
    h,
    kids: [],
    span: 0,
    deep: 0,
    x: 0,
    y: 0,
    cy: 0,
  };
}

export function layoutTree(
  all: TNodeIn[],
  colsIn: TColIn[],
  columnOf: (n: TNodeIn) => string,
  showCrafted: boolean,
  root: { w: number; h: number }
): TLayout {
  const byId = new Map(all.map((n) => [n.id, n]));
  const visible = all.filter((n) => n.group !== "cancelled" && (showCrafted || n.group !== "completed"));
  const vis = new Set(visible.map((n) => n.id));
  const colOf = new Map(all.map((n) => [n.id, columnOf(n)]));

  // requirements inside this Blueprint, and who each Item unlocks
  const req = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const n of all) {
    const bs = n.blockers.filter((b) => byId.has(b) && b !== n.id);
    req.set(n.id, bs);
    for (const b of bs) dependents.set(b, [...(dependents.get(b) ?? []), n.id]);
  }
  const isBlocked = (id: string) => (req.get(id) ?? []).some((b) => !CLOSED.has(byId.get(b)!.group));
  const stateOf = (n: TNodeIn): TState =>
    n.group === "completed"
      ? "done"
      : n.group === "started"
        ? "active"
        : isBlocked(n.id)
          ? "locked"
          : n.group === "backlog"
            ? "backlog"
            : "ready";
  const order = (a: TNodeIn, b: TNodeIn) =>
    STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)] ||
    (GRADE[a.priority] ?? 4) - (GRADE[b.priority] ?? 4) ||
    (RANK[a.group] ?? 5) - (RANK[b.group] ?? 5) ||
    a.seq - b.seq;

  // each visible Item's tree parent: the Item it is a Component of, else an Item that requires
  // it, in the same group; else the group itself
  const treeParent = new Map<string, string | null>();
  const leadsBack = (from: string, to: string) => {
    let cur: string | null | undefined = from;
    for (let i = 0; cur && i < 500; i++) {
      if (cur === to) return true;
      cur = treeParent.get(cur);
    }
    return false;
  };
  for (const n of [...visible].sort(order)) {
    const col = colOf.get(n.id);
    const cands = [
      ...(n.parent ? [n.parent] : []),
      ...[...(dependents.get(n.id) ?? [])].sort((a, b) => order(byId.get(a)!, byId.get(b)!)),
    ];
    const p = cands.find((c) => vis.has(c) && colOf.get(c) === col && !leadsBack(c, n.id));
    treeParent.set(n.id, p ?? null);
  }
  const itemKids = new Map<string, TNodeIn[]>();
  for (const n of visible) {
    const p = treeParent.get(n.id);
    if (p) itemKids.set(p, [...(itemKids.get(p) ?? []), n]);
  }
  itemKids.forEach((list) => list.sort(order));

  // groups (Kits): stats and state
  const colKeys = new Set(colsIn.map((c) => c.key));
  const stats = new Map(
    colsIn.map((c) => {
      const its = all.filter((n) => n.group !== "cancelled" && colOf.get(n.id) === c.key);
      const done = its.filter((n) => n.group === "completed").length;
      return [
        c.key,
        {
          done,
          total: its.length,
          crafting: its.filter((n) => n.group === "started").length,
          hidden: showCrafted ? 0 : done,
          open: its.filter((n) => !CLOSED.has(n.group)),
        },
      ];
    })
  );
  const needsOf = (c: TColIn) => (c.needs ?? []).filter((k) => colKeys.has(k) && k !== c.key);
  const kitState = (c: TColIn): TState => {
    const s = stats.get(c.key)!;
    if (s.total && s.done === s.total) return "done";
    if (s.crafting) return "active";
    if (needsOf(c).some((k) => stats.get(k)!.done < stats.get(k)!.total)) return "locked";
    if (s.open.some((n) => stateOf(n) === "ready")) return "ready";
    return "backlog";
  };

  // the next Item: the first one Crafting with nothing in its way, else the best one ready
  const cands = visible.filter((n) => n.group === "started" && !isBlocked(n.id));
  const next = (cands.length ? cands : visible.filter((n) => stateOf(n) === "ready")).sort(order)[0]?.id ?? null;

  // ---- the layout tree
  const itemNode = (n: TNodeIn): LNode => {
    const ln = leaf(n.id, "item", CELL_W, CELL_H);
    ln.kids = (itemKids.get(n.id) ?? []).map(itemNode);
    return ln;
  };
  const groupKids = (c: TColIn): LNode[] => {
    const tops = visible.filter((n) => colOf.get(n.id) === c.key && !treeParent.get(n.id)).sort(order);
    return tops.map(itemNode);
  };

  // Kits: a Kit hangs above the first Kit that needs it; the rest go straight into the goal
  const sortedCols = [...colsIn].sort(
    (a, b) => STATE_RANK[kitState(a)] - STATE_RANK[kitState(b)] || colsIn.indexOf(a) - colsIn.indexOf(b)
  );
  const kitParent = new Map<string, string>();
  const kitLeadsBack = (from: string, to: string) => {
    let cur: string | undefined = from;
    for (let i = 0; cur && i < 200; i++) {
      if (cur === to) return true;
      cur = kitParent.get(cur);
    }
    return false;
  };
  for (const c of sortedCols)
    for (const d of sortedCols)
      if (!kitParent.has(c.key) && needsOf(d).includes(c.key) && !kitLeadsBack(d.key, c.key))
        kitParent.set(c.key, d.key);
  const kitNode = (c: TColIn): LNode => {
    const ln = leaf(c.key, "kit", KIT_W, KIT_H);
    ln.kids = [...sortedCols.filter((k) => kitParent.get(k.key) === c.key).map(kitNode), ...groupKids(c)];
    return ln;
  };
  const goal = leaf(GOAL, "goal", root.w, root.h);
  for (const c of sortedCols) {
    if (kitParent.has(c.key)) continue;
    if (c.plain) goal.kids.push(...groupKids(c));
    else goal.kids.push(kitNode(c));
  }

  // ---- measure (heights and widths of every subtree), then place from the goal leftwards
  // where a wire meets a node, down from its top: the middle of its square
  const anchor = (n: LNode) => (n.kind === "item" ? ITEM_SQ / 2 : n.kind === "kit" ? KIT_SQ / 2 : n.h / 2);
  // the square's left and right edges (a tile's label is wider than its square)
  const sq = (n: LNode) => (n.kind === "item" ? ITEM_SQ : n.kind === "kit" ? KIT_SQ : n.w);
  const kidsH = (n: LNode) => n.kids.reduce((s, k) => s + k.span, 0) + STACK_GAP * Math.max(0, n.kids.length - 1);
  const measure = (n: LNode) => {
    n.kids.forEach(measure);
    n.span = Math.max(n.h, kidsH(n));
    n.deep = n.w + (n.kids.length ? DEPTH_GAP + Math.max(...n.kids.map((k) => k.deep)) : 0);
  };
  const place = (n: LNode, top: number, right: number) => {
    n.x = right - n.w;
    let y = top + (n.span - kidsH(n)) / 2;
    for (const k of n.kids) {
      place(k, y, n.x + (n.w - sq(n)) / 2 - DEPTH_GAP);
      y += k.span + STACK_GAP;
    }
    const a = anchor(n);
    const mid = n.kids.length ? (n.kids[0].cy + n.kids[n.kids.length - 1].cy) / 2 : top + n.span / 2;
    n.cy = Math.min(top + n.span - n.h + a, Math.max(top + a, mid));
    n.y = n.cy - a;
  };
  measure(goal);
  place(goal, PAD, PAD + goal.deep);

  // ---- tiles and tree wires
  const items = new Map<string, TItemTile>();
  const kits: TKitTile[] = [];
  const wires: TWire[] = [];
  const doneOf = (ln: LNode) =>
    ln.kind === "item"
      ? byId.get(ln.key)?.group === "completed"
      : ln.kind === "kit"
        ? kitState(colsIn.find((c) => c.key === ln.key)!) === "done"
        : false;
  const itemTile = (n: TNodeIn, x: number, y: number) => {
    const comps = all.filter((c) => c.parent === n.id && c.group !== "cancelled");
    items.set(n.id, {
      ...n,
      kind: "item",
      col: colOf.get(n.id)!,
      x,
      y,
      state: stateOf(n),
      next: n.id === next,
      componentsDone: comps.filter((c) => c.group === "completed").length,
    });
  };
  const walk = (n: LNode) => {
    if (n.kind === "item") itemTile(byId.get(n.key)!, n.x, n.y);
    else if (n.kind === "kit") {
      const c = colsIn.find((cc) => cc.key === n.key)!;
      const s = stats.get(c.key)!;
      kits.push({
        ...c,
        kind: "kit",
        id: c.key,
        x: n.x,
        y: n.y,
        state: kitState(c),
        done: s.done,
        total: s.total,
        crafting: s.crafting,
        hidden: s.hidden,
      });
    }
    for (const k of n.kids) {
      // from the right edge of the kid's square across to the left edge of this node's square
      const fromX = k.x + (k.w + sq(k)) / 2;
      const toX = n.x + (n.w - sq(n)) / 2;
      const nextHere = k.kind === "item" && k.key === next;
      wires.push({
        id: `w-${k.key}`,
        from: k.key,
        to: n.key,
        kind: "tree",
        d: `M${fromX} ${k.cy}H${toX - DEPTH_GAP / 2}V${n.cy}H${toX}`,
        done: doneOf(k),
        charge: nextHere,
      });
      walk(k);
    }
  };
  walk(goal);

  // requirements that aren't tree lines: dashed arrows, across Kits too
  for (const p of items.values()) {
    for (const b of req.get(p.id) ?? []) {
      const q = items.get(b);
      if (!q || treeParent.get(b) === p.id) continue;
      const sx = q.x + (CELL_W + ITEM_SQ) / 2;
      const sy = q.y + ITEM_SQ / 2;
      const tx = p.x + (CELL_W - ITEM_SQ) / 2;
      const ty = p.y + ITEM_SQ / 2;
      const bend = Math.max(40, Math.abs(tx - sx) / 2);
      wires.push({
        id: `r-${b}-${p.id}`,
        from: b,
        to: p.id,
        kind: "extra",
        d: `M${sx} ${sy}C${sx + bend} ${sy},${tx - bend} ${ty},${tx} ${ty}`,
        done: q.group === "completed",
        charge: false,
      });
    }
  }

  return {
    items,
    kits,
    wires,
    goal: { x: goal.x, y: goal.y, w: goal.w, h: goal.h },
    width: goal.deep + PAD * 2,
    height: goal.span + PAD * 2,
    next,
  };
}

/** Everything on the way to an Item (requirements, Components) and what it leads to. */
export function pathOf(id: string, all: Map<string, TNodeIn>): Set<string> {
  const out = new Set<string>([id]);
  const up = [id];
  while (up.length) {
    const n = all.get(up.pop()!);
    if (!n) continue;
    const prev = [...n.blockers, ...[...all.values()].filter((c) => c.parent === n.id).map((c) => c.id)];
    for (const b of prev) {
      if (out.has(b)) continue;
      out.add(b);
      up.push(b);
    }
  }
  const down = [id];
  const seenDown = new Set<string>();
  while (down.length) {
    const cur = down.pop()!;
    if (seenDown.has(cur)) continue;
    seenDown.add(cur);
    const n = all.get(cur);
    const next = [
      ...[...all.values()].filter((d) => d.blockers.includes(cur)).map((d) => d.id),
      ...(n?.parent ? [n.parent] : []),
    ];
    for (const d of next) {
      out.add(d);
      down.push(d);
    }
  }
  return out;
}
