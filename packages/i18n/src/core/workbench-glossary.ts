/**
 * Workbench glossary: renames Plane's concepts to Rust ones in the English strings as
 * they load (Workspace → Game Server, Project → Blueprint, Work item → Item, Cycle → Wipe,
 * Module → Kit, Intake → Airdrop, Drafts → Stash, Archive → Storage, Pages → Notes,
 * Members → Teammates, Labels → Tags, Estimate → Scrap cost; Plane → Workbench).
 * Done at load time instead of editing the locale files, so new upstream strings get
 * renamed too and upstream syncs never conflict. ICU variable names ({projectName},
 * {count, plural, …}) are protected, so only visible text changes.
 */

type Rule = [RegExp, string];

// Order matters: longer phrases first. Each pattern keeps the casing of its first letter
// via `keepCase`; ALL-CAPS words are handled by upper-casing the replacement.
const PHRASES: Array<[string, string]> = [
  ["sub-work items", "components"],
  ["sub-work item", "component"],
  ["sub work items", "components"],
  ["sub work item", "component"],
  ["sub-issues", "components"],
  ["sub-issue", "component"],
  ["work items", "items"],
  ["work item", "item"],
  ["workitems", "items"],
  ["workitem", "item"],
  ["issues", "items"],
  ["issue", "item"],
  ["an estimate", "a scrap cost"],
  ["estimates", "scrap costs"],
  ["estimate", "scrap cost"],
  ["an archive", "a storage"],
  ["unarchived", "retrieved"],
  ["unarchive", "retrieve"],
  ["unarchiving", "retrieving"],
  ["archives", "storage"],
  ["archived", "stored"],
  ["archiving", "storing"],
  ["archive", "store"],
  ["an intake", "an airdrop"],
  ["intakes", "airdrops"],
  ["intake", "airdrop"],
  ["workspaces", "game servers"],
  ["workspace", "game server"],
  ["projects", "blueprints"],
  ["project", "blueprint"],
  ["cycles", "wipes"],
  ["cycle", "wipe"],
  ["modules", "kits"],
  ["module", "kit"],
  ["drafts", "stash"],
  ["draft", "stash"],
  ["members", "teammates"],
  ["member", "teammate"],
  ["labels", "tags"],
  ["label", "tag"],
];

// "Pages" is also plain English ("next page"), so only the capitalised feature name and
// strings inside the page/wiki namespaces are renamed.
const PAGE_PHRASES: Array<[string, string]> = [
  ["pages", "notes"],
  ["page", "note"],
];

function keepCase(match: string, word: string): string {
  if (match.length > 1 && match === match.toUpperCase()) return word.toUpperCase();
  // "Workspace" -> "Game Server", "Estimate" -> "Scrap Cost": capitalised -> title case
  if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase())
    return word.replace(/(^|\s)(\w)/g, (_, sp: string, c: string) => sp + c.toUpperCase());
  return word;
}

function compile(pairs: Array<[string, string]>): Rule[] {
  return pairs.map(([from, to]) => [new RegExp(`(?<![\\w{])${from.replace(/[-\s]/g, "[-\\s]")}(?![\\w}])`, "gi"), to]);
}

const RULES = compile(PHRASES);
const PAGE_RULES = compile(PAGE_PHRASES);
const CAPITAL_PAGES: Rule[] = [[/(?<!\w)Pages(?!\w)/g, "Notes"]];

const NEW_WORDS =
  "items?|airdrops?|blueprints?|wipes?|kits?|game servers?|stash|storage|teammates?|tags?|components?|scrap costs?|notes?|store|retrieve";
const ARTICLE = new RegExp(`(?<!\\w)(an?|An?)(\\s+)(${NEW_WORDS})(?!\\w)`, "g");

// {name} or {count, plural, …}: the identifier after "{" is code, not text
const VARIABLE = /\{\s*[A-Za-z_][\w.]*\s*(?=[,}])/g;
// Plane the product, not "plane" the word (and never inside a URL/domain)
const BRAND: Rule = [/(?<![\w./@-])Plane(?![\w.-]*\.(so|com|io))(?!\w)/g, "Workbench"];

function renameText(text: string, pageNs: boolean): string {
  const saved: string[] = [];
  let out = text.replace(VARIABLE, (m) => {
    saved.push(m);
    return `\uE000${saved.length - 1}\uE000`;
  });
  for (const [re, to] of RULES) out = out.replace(re, (m) => keepCase(m, to));
  for (const [re, to] of pageNs ? PAGE_RULES : CAPITAL_PAGES) out = out.replace(re, (m) => keepCase(m, to));
  out = out.replace(BRAND[0], BRAND[1]);
  // a/an in front of the new words ("a item" -> "an item", "an blueprint" -> "a blueprint")
  out = out.replace(ARTICLE, (_m: string, a: string, sp: string, w: string) => {
    const an = /^[aeiou]/i.test(w);
    const art = a[0] === "A" ? (an ? "An" : "A") : an ? "an" : "a";
    return art + sp + w;
  });
  return out.replace(/\uE000(\d+)\uE000/g, (_, i: string) => saved[Number(i)]);
}

// exact UI values that read differently in Rust terms
const EXACT: Record<string, string> = {
  Backlog: "Locked",
  Todo: "To Craft",
  Unstarted: "To Craft",
  "In Progress": "Crafting",
  "In progress": "Crafting",
  Started: "Crafting",
  Done: "Crafted",
  Completed: "Crafted",
  Cancelled: "Scrapped",
  Canceled: "Scrapped",
  Urgent: "Armored",
  High: "Sheet Metal",
  Medium: "Stone",
  Low: "Wood",
  "No priority": "Twig",
};
const EXACT_KEYS =
  /(^|\.)(backlog|unstarted|started|completed|cancelled|canceled|in_progress|todo|done|urgent|high|medium|low|none|no_priority)$/;

export function applyGlossary<T>(resource: T, namespace: string, path = ""): T {
  if (typeof resource === "string") {
    const exact = EXACT_KEYS.test(path) ? EXACT[resource] : undefined;
    return (exact ?? renameText(resource, namespace === "page" || namespace === "wiki")) as T;
  }
  if (Array.isArray(resource)) return resource.map((v, i) => applyGlossary(v, namespace, `${path}.${i}`)) as T;
  if (resource && typeof resource === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(resource as Record<string, unknown>))
      out[k] = applyGlossary(v, namespace, path ? `${path}.${k}` : k);
    return out as T;
  }
  return resource;
}
