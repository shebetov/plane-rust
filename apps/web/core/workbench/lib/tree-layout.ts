/**
 * Lays out a Blueprint's research tree: the Blueprint at the top, a column per Kit (or per
 * tag when the Blueprint has no Kits), and inside each column the Items as a real tree:
 * an Item hangs under the Item it requires (or the Item it is a Component of), indented,
 * with "tree" lines; any further requirements become curved "extra" lines, also across
 * columns. Positions are plain numbers so the page can draw nodes and an SVG of edges.
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
export type TColIn = { key: string; label: string; logo?: unknown; color?: string | null };

export type TPlaced = TNodeIn & {
  col: string;
  x: number;
  y: number;
  treeParent: string | null;
  blocked: boolean; // a requirement isn't crafted yet
  ready: boolean; // nothing in the way and not started
  dependents: string[];
  componentsDone: number;
};
export type TCol = TColIn & {
  x: number;
  width: number;
  done: number;
  total: number;
  crafting: number;
  hidden: number;
  state: "crafted" | "crafting" | "to-craft" | "locked" | "empty";
};
export type TEdge = {
  id: string;
  from: string;
  to: string;
  kind: "trunk" | "tree" | "extra";
  d: string;
  done: boolean;
};
export type TLayout = {
  cols: TCol[];
  nodes: Map<string, TPlaced>;
  edges: TEdge[];
  width: number;
  height: number;
  root: { x: number; y: number; w: number; h: number };
  busY: number;
  headerY: number;
};

export const NODE_W = 236;
export const NODE_H = 86;
export const HEADER_W = 236;
export const HEADER_H = 110;
const IND = 26;
const GAP_Y = 12;
const COL_GAP = 64;
/** the Blueprint block (its name with the Tool Cupboard under it); the page passes its measured height */
export const ROOT_W = 340;
export const ROOT_W_NARROW = 300;
const MAX_INDENT = 4;

const CLOSED = new Set(["completed", "cancelled"]);
const RANK: Record<string, number> = { started: 0, unstarted: 1, backlog: 2, completed: 3, cancelled: 4 };

export function layoutTree(
  all: TNodeIn[],
  colsIn: TColIn[],
  columnOf: (n: TNodeIn) => string,
  showCrafted: boolean,
  root: { w: number; h: number }
): TLayout {
  const { w: rootW, h: rootH } = root;
  const BUS_Y = rootH + 30;
  const HEADER_Y = BUS_Y + 30;
  const ITEMS_Y = HEADER_Y + HEADER_H + 26;
  const byId = new Map(all.map((n) => [n.id, n]));
  const visible = all.filter((n) => n.group !== "cancelled" && (showCrafted || n.group !== "completed"));
  const vis = new Set(visible.map((n) => n.id));

  // requirements inside this Blueprint, and who each Item unlocks
  const req = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const n of all) {
    const bs = n.blockers.filter((b) => byId.has(b) && b !== n.id);
    req.set(n.id, bs);
    for (const b of bs) dependents.set(b, [...(dependents.get(b) ?? []), n.id]);
  }
  // depth along requirements (longest path), safe against cycles
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(-1, ...(req.get(id) ?? []).map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  all.forEach((n) => depthOf(n.id));

  const colKey = new Map(visible.map((n) => [n.id, columnOf(n)]));
  const isBlocked = (id: string) => (req.get(id) ?? []).some((b) => !CLOSED.has(byId.get(b)!.group));
  // in a column: Crafting first, then what can be crafted now, blocked Items last
  const order = (a: TNodeIn, b: TNodeIn) =>
    (RANK[a.group] ?? 5) - (RANK[b.group] ?? 5) || Number(isBlocked(a.id)) - Number(isBlocked(b.id)) || a.seq - b.seq;

  // tree parent: the Item it is a Component of, else its deepest requirement, in the same column
  const treeParent = new Map<string, string | null>();
  for (const n of visible) {
    const col = colKey.get(n.id);
    let p: string | null = null;
    if (n.parent && vis.has(n.parent) && colKey.get(n.parent) === col) p = n.parent;
    else {
      const same = (req.get(n.id) ?? []).filter((b) => vis.has(b) && colKey.get(b) === col);
      same.sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
      p = same[0] ?? null;
    }
    treeParent.set(n.id, p);
  }
  const kids = new Map<string | null, TNodeIn[]>();
  for (const n of visible) {
    const p = treeParent.get(n.id) ?? null;
    kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  kids.forEach((list) => list.sort(order));

  // columns, ordered so a column comes after the ones its Items require
  const colIds = colsIn.map((c) => c.key);
  const colNeeds = new Map<string, Set<string>>(colIds.map((k) => [k, new Set()]));
  for (const n of all) {
    const c = columnOf(n);
    if (CLOSED.has(n.group)) continue;
    for (const b of req.get(n.id) ?? []) {
      const bn = byId.get(b)!;
      const bc = columnOf(bn);
      if (bc !== c && !CLOSED.has(bn.group)) colNeeds.get(c)?.add(bc);
    }
  }
  const stats = new Map(
    colIds.map((k) => {
      const its = all.filter((n) => n.group !== "cancelled" && columnOf(n) === k);
      const done = its.filter((n) => n.group === "completed").length;
      const crafting = its.filter((n) => n.group === "started").length;
      const hidden = showCrafted ? 0 : done;
      return [k, { done, total: its.length, crafting, hidden }];
    })
  );
  const colState = (k: string): TCol["state"] => {
    const s = stats.get(k)!;
    if (!s.total) return "empty";
    if (s.done === s.total) return "crafted";
    if (s.crafting) return "crafting";
    if ([...(colNeeds.get(k) ?? [])].length) return "locked";
    return "to-craft";
  };
  const STATE_RANK = { crafting: 0, "to-craft": 1, locked: 2, empty: 3, crafted: 4 };
  const placedCols: string[] = [];
  const pending = colsIn.slice();
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a copy
  pending.sort((a, b) => STATE_RANK[colState(a.key)] - STATE_RANK[colState(b.key)]);
  while (pending.length) {
    const i = pending.findIndex((c) =>
      [...(colNeeds.get(c.key) ?? [])].every((d) => placedCols.includes(d) || !colIds.includes(d))
    );
    const [c] = pending.splice(i < 0 ? 0 : i, 1);
    placedCols.push(c.key);
  }

  // place: depth-first inside each column, so a chain stays together
  const nodes = new Map<string, TPlaced>();
  const seqs = new Map<string, string[]>();
  const indent = new Map<string, number>();
  const seen = new Set<string>();
  for (const k of placedCols) {
    const seqList: string[] = [];
    const walk = (n: TNodeIn, lvl: number) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      seqList.push(n.id);
      indent.set(n.id, Math.min(lvl, MAX_INDENT));
      for (const c of kids.get(n.id) ?? []) walk(c, lvl + 1);
    };
    const roots = (kids.get(null) ?? []).filter((n) => colKey.get(n.id) === k);
    roots.forEach((r) => walk(r, 0));
    // anything only reachable through a cycle
    visible.filter((n) => colKey.get(n.id) === k && !seen.has(n.id)).forEach((n) => walk(n, 0));
    seqs.set(k, seqList);
  }

  const cols: TCol[] = [];
  let x = 0;
  for (const k of placedCols) {
    const c = colsIn.find((cc) => cc.key === k)!;
    const maxInd = Math.max(0, ...(seqs.get(k) ?? []).map((id) => indent.get(id) ?? 0));
    const width = Math.max(HEADER_W, NODE_W + IND * (maxInd + 1));
    cols.push({ ...c, x, width, ...stats.get(k)!, state: colState(k) });
    x += width + COL_GAP;
  }
  const colX = new Map(cols.map((c) => [c.key, c.x]));

  const ys = new Map<string, number>();
  for (const [k, list] of seqs) {
    let y = ITEMS_Y;
    for (const id of list) {
      ys.set(id, y);
      y += NODE_H + GAP_Y;
    }
    void k;
  }
  // an Item sits below the Items it requires in other columns (push the rest down)
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const [k, list] of seqs) {
      list.forEach((id, i) => {
        const need = Math.max(
          0,
          ...(req.get(id) ?? [])
            .filter((b) => vis.has(b) && colKey.get(b) !== k)
            .map((b) => (ys.get(b) ?? 0) + NODE_H + 20)
        );
        const delta = need - (ys.get(id) ?? 0);
        if (delta > 0) {
          for (const rest of list.slice(i)) ys.set(rest, (ys.get(rest) ?? 0) + delta);
          moved = true;
        }
      });
    }
    if (!moved) break;
  }

  for (const n of visible) {
    const k = colKey.get(n.id)!;
    const blocked = isBlocked(n.id);
    const comps = all.filter((c) => c.parent === n.id && c.group !== "cancelled");
    nodes.set(n.id, {
      ...n,
      col: k,
      x: (colX.get(k) ?? 0) + IND * ((indent.get(n.id) ?? 0) + 1),
      y: ys.get(n.id) ?? ITEMS_Y,
      treeParent: treeParent.get(n.id) ?? null,
      blocked,
      ready: !blocked && n.group === "unstarted",
      dependents: dependents.get(n.id) ?? [],
      componentsDone: comps.filter((c) => c.group === "completed").length,
    });
  }

  // edges
  const edges: TEdge[] = [];
  const mid = (p: TPlaced) => p.y + NODE_H / 2;
  for (const c of cols) {
    const roots = (seqs.get(c.key) ?? []).map((id) => nodes.get(id)!).filter((p) => !p.treeParent);
    const tx = c.x + 13;
    for (const r of roots)
      edges.push({
        id: `t-${r.id}`,
        from: c.key,
        to: r.id,
        kind: "trunk",
        d: `M${tx} ${HEADER_Y + HEADER_H}V${mid(r)}H${r.x}`,
        done: r.group === "completed",
      });
  }
  for (const p of nodes.values()) {
    if (p.treeParent) {
      const t = nodes.get(p.treeParent)!;
      edges.push({
        id: `p-${p.id}`,
        from: t.id,
        to: p.id,
        kind: "tree",
        d: `M${t.x + 13} ${t.y + NODE_H}V${mid(p)}H${p.x}`,
        done: t.group === "completed",
      });
    }
    for (const b of req.get(p.id) ?? []) {
      if (b === p.treeParent) continue;
      const q = nodes.get(b);
      if (!q) continue;
      let d: string;
      if (q.col === p.col) {
        const c = cols.find((cc) => cc.key === p.col)!;
        const gx = c.x + c.width + 22;
        d = `M${q.x + NODE_W} ${mid(q)}C${gx} ${mid(q)},${gx} ${mid(p)},${p.x + NODE_W} ${mid(p)}`;
      } else if (q.x < p.x) {
        const dx = Math.max(40, (p.x - q.x - NODE_W) / 2);
        d = `M${q.x + NODE_W} ${mid(q)}C${q.x + NODE_W + dx} ${mid(q)},${p.x - dx} ${mid(p)},${p.x} ${mid(p)}`;
      } else {
        const dx = Math.max(40, (q.x - p.x - NODE_W) / 2);
        d = `M${q.x} ${mid(q)}C${q.x - dx} ${mid(q)},${p.x + NODE_W + dx} ${mid(p)},${p.x + NODE_W} ${mid(p)}`;
      }
      edges.push({ id: `r-${b}-${p.id}`, from: b, to: p.id, kind: "extra", d, done: q.group === "completed" });
    }
  }

  const bottom = Math.max(HEADER_Y + HEADER_H, ...[...nodes.values()].map((p) => p.y + NODE_H));
  return {
    cols,
    nodes,
    edges,
    width: Math.max(x - COL_GAP + 40, rootW + 40),
    height: bottom + 40,
    root: { x: 0, y: 0, w: rootW, h: rootH },
    busY: BUS_Y,
    headerY: HEADER_Y,
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
