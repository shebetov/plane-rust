/**
 * Client for the Workbench companion (/wb/api/*, same origin, Plane session cookie).
 * When the companion is down the game layer just hides; Plane keeps working.
 */
import useSWR from "swr";

export type TLogo = { in_use?: string; icon?: { name?: string; color?: string }; emoji?: { value?: string } } | null;
export type TTc = { state: "protected" | "due" | "decaying" | "learned" | "empty"; until: string | null };
export type TWipe = { index: number; number: number; start: string; end: string };

export type TState = {
  wipe: TWipe;
  scrap: { earned: number; spent: number; balance: number };
  owned: string[];
  equipped: { banner?: string; frame?: string; badge?: string };
  tc: Record<string, TTc>;
  last_visit: string | null;
};

export type TCrafted = {
  id: string;
  name: string;
  project: string;
  project_name?: string;
  identifier?: string;
  seq?: number;
  logo?: TLogo;
  at: string;
  scrap: number;
};

export type THomeBlueprint = {
  id: string;
  name: string;
  identifier: string;
  logo: TLogo;
  open: number;
  done: number;
  total: number;
  crafting: number;
  last_craft: string | null;
  updated_at: string | null;
  tc: TTc;
};

export type THome = {
  wipe: TWipe & { crafted?: number; scrap?: number };
  blueprints: THomeBlueprint[];
  news: Array<{
    item_id: string;
    name: string;
    project: string;
    project_name?: string;
    identifier?: string;
    seq?: number;
    at: string;
    scrap: number;
    logo?: TLogo;
  }>;
  report_due: number | null;
};

export type TQueueItem = {
  id: string;
  name: string;
  seq: number;
  project: string;
  identifier: string;
  logo: TLogo;
  priority: string;
  updated_at: string;
  decay: number;
};

export type TTreeItem = {
  id: string;
  name: string;
  seq: number;
  group: string;
  priority: string;
  decay: number;
  completed_at: string | null;
};
export type TTreeKit = {
  id: string;
  name: string;
  logo: TLogo;
  items: TTreeItem[];
  done: number;
  total: number;
  state: "crafted" | "crafting" | "to-craft" | "locked";
  needs: string[];
};
export type TTree = {
  blueprint: {
    id: string;
    name: string;
    identifier: string;
    logo: TLogo;
    description?: string;
    target?: string | null;
    domain?: string | null;
  };
  tc: TTc;
  kits: TTreeKit[];
  loose: TTreeItem[];
  /** Items with no Kit, by tag; one group with name null when nothing is tagged */
  loose_groups?: Array<{
    tag: string | null;
    name: string | null;
    color: string | null;
    items: TTreeItem[];
    done: number;
    total: number;
  }>;
  next: string | null;
  done: number;
  total: number;
  learned: boolean;
};

export type TOffer = {
  id: string;
  name: string;
  kind: string;
  cost: number;
  desc: string;
  repeat: boolean;
  owned: boolean;
};
export type TShop = { balance: number; equipped: TState["equipped"]; offers: TOffer[] };

export type TWipeReport = {
  index: number;
  number: number;
  start: string;
  end: string;
  crafted: number;
  scrapped: number;
  scrap: number;
  blueprints: Array<{ id: string; name: string; logo: TLogo; crafted: number; neglected: boolean }>;
  next: Array<{ blueprint: string; kit: string; logo: TLogo }>;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/wb/api/${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Workbench ${r.status}`);
  }
  return (await r.json()) as T;
}

export const wb = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
};

const opts = { revalidateOnFocus: true, shouldRetryOnError: false, dedupingInterval: 5000 };

export const useWbState = () =>
  useSWR<TState>("wb:state", () => wb.get<TState>("state"), { ...opts, refreshInterval: 60_000 });
export const useWbHome = () => useSWR<THome>("wb:home", () => wb.get<THome>("home"), opts);
export const useWbQueue = () =>
  useSWR<{ items: TQueueItem[] }>("wb:crafting", () => wb.get<{ items: TQueueItem[] }>("crafting"), {
    ...opts,
    refreshInterval: 60_000,
  });
export const useWbTree = (pid?: string) =>
  useSWR<TTree>(pid ? `wb:tree:${pid}` : null, () => wb.get<TTree>(`tree/${pid}`), opts);
export const useWbShop = () => useSWR<TShop>("wb:shop", () => wb.get<TShop>("shop"), opts);
export const useWbReport = (index?: number | null) =>
  useSWR<TWipeReport>(
    index === undefined || index === null ? null : `wb:report:${index}`,
    () => wb.get<TWipeReport>(`wipe-report?index=${index}`),
    opts
  );

/** A sorted copy (the TS target here has no Array#toSorted yet). */
export function sortedBy<T>(list: readonly T[], key: (v: T) => number): T[] {
  const copy = list.slice();
  // oxlint-disable-next-line unicorn/no-array-sort -- sorting a copy
  copy.sort((a, b) => key(a) - key(b));
  return copy;
}
