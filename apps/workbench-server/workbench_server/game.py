"""Workbench's game rules, as pure functions over Plane data (no I/O, fully tested).

Glossary: Blueprint = Plane project, Kit = module, Item = work item, Wipe = cycle.
State groups: backlog = Locked, unstarted = To Craft, started = Crafting,
completed = Crafted, cancelled = Scrapped.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

# ---------------------------------------------------------------- wipes

WIPE_EPOCH = date(2026, 10, 29)  # Thursday; a server wipe every 14 days from here
WIPE_DAYS = 14


def wipe_at(now: datetime, tz: timezone | None = None) -> dict:
    """The server wipe in progress at `now` (local calendar days). `index` counts from 0
    at the epoch; the displayed number adds the offset of wipes imported from Linear."""
    local = now.astimezone(tz) if tz else now.astimezone()
    days = (local.date() - WIPE_EPOCH).days
    index = days // WIPE_DAYS
    start = WIPE_EPOCH + timedelta(days=index * WIPE_DAYS)
    return {"index": index, "start": start, "end": start + timedelta(days=WIPE_DAYS)}


def wipe_name(number: int) -> str:
    return f"Wipe #{number}"


# ---------------------------------------------------------------- scrap

# scrap per crafted item, by priority (Rust building grade)
SCRAP = {"none": 5, "low": 10, "medium": 15, "high": 25, "urgent": 40}
COMPONENT_SCRAP = 5  # a sub-item


def item_scrap(item: dict, group: str) -> int:
    if group != "completed":
        return 0
    if item.get("parent"):
        return COMPONENT_SCRAP
    return SCRAP.get(item.get("priority") or "none", 5)


# ---------------------------------------------------------------- shop (draft)

@dataclass(frozen=True)
class Offer:
    id: str
    name: str
    kind: str  # banner | frame | badge | upkeep
    cost: int
    desc: str
    repeat: bool = False


def _banner(slug: str, name: str, cost: int, desc: str) -> Offer:
    return Offer(f"banner-{slug}", f"Banner: {name}", "banner", cost, desc)


# Main-menu banners: the picture is theme/menu/bg/<slug>.jpg (the web app maps the id).
BANNERS = [
    _banner("snow", "Arctic Base", 120, "Arctic pack art, cold and blue"),
    _banner("desert", "Desert Outpost", 120, "An adobe compound behind barbed wire"),
    _banner("night", "Night Raid", 160, "The plague doctor under a full moon"),
    _banner("adobe-house", "Adobe House", 120, "A sand-brick base among the palms"),
    _banner("jungle-house", "Jungle Temple", 160, "A stone base deep in the jungle"),
    _banner("jungle", "Jungle", 100, "Leaves and light, out of focus"),
    _banner("frontier", "Frontier", 150, "Barrels, bear heads and the frontier decor pack"),
    _banner("frontiersman", "Frontiersman", 180, "A hunter in a dark pine forest"),
    _banner("nomad", "Nomad", 200, "A lone wanderer in a dust storm"),
    _banner("abyss", "Abyss", 200, "Three divers from the Abyss pack"),
    _banner("abyss-deep", "Abyss Deep", 80, "Dark water, nothing else"),
    _banner("medieval", "Medieval", 100, "Embers drifting through the dark"),
    _banner("gestures", "Gestures", 150, "Three survivors striking a pose"),
    _banner("exhibit", "Exhibit", 150, "A lounge full of mannequins"),
    _banner("sunburn", "Sunburn", 120, "A milk crate on a hot beach"),
    _banner("disco", "Disco Night", 180, "A packed dance floor under the lasers"),
    *(_banner(f"plague-{n}", f"Plague Doctor {r}", 150, "From the Plague Doctor pack")
      for n, r in ((1, "I"), (2, "II"), (3, "III"), (4, "IV"), (6, "VI"), (7, "VII"), (8, "VIII"))),
]

# Video banners: the game's own main-menu loops, theme/menu/video/<name>.mp4 (slug video-<name>).
VIDEO_BANNERS = [
    _banner(f"video-{slug}", name, cost, desc)
    for slug, name, cost, desc in (
        ("oilrig", "Oil Rig", 400, "The rig on the horizon at sunset"),
        ("nukesilo", "Missile Silo", 400, "Hangars in the hills around the silo"),
        ("scrapheli", "Scrap Heli", 400, "The transport heli parked at the yard"),
        ("lighthouse", "Lighthouse", 350, "A lighthouse against the setting sun"),
        ("moonpool", "Moon Pool", 350, "The sub bay of an underwater lab"),
        ("scientists", "Scientists", 350, "A patrol in blue hazmat suits"),
        ("autoturret", "Auto Turret", 350, "A turret wakes up in a dark base"),
        ("locomotive", "Locomotive", 350, "A train rolling through the desert"),
        ("arcticlabs", "Arctic Labs", 300, "Wind turbines over the snowbound base"),
        ("attackhelicopter", "Minicopter", 300, "A minicopter waiting by the wall"),
        ("banditcamp1", "Bandit Camp", 300, "Stairs up into the camp"),
        ("banditcamp2", "Bandit Swamp", 300, "The camp's huts in the misty swamp"),
        ("desertbase1", "Desert Base", 300, "A water tower in the haze"),
        ("desertbase2", "Barbed Wire", 300, "Wire and towers in the dunes"),
        ("dome", "The Dome", 300, "The rusted sphere in the pines"),
        ("ferryterminal", "Ferry Terminal", 300, "Cars on the ramp by the sea"),
        ("harbor1", "Harbor", 300, "Cranes over the harbour water"),
        ("harbor2", "Harbor Docks", 300, "A container ship below the mountain"),
        ("harbor4", "Harbor Yard", 300, "Old brick and a bollard by the quay"),
        ("outpost", "Outpost", 300, "A long walk down the safe-zone street"),
        ("tugboat", "Tugboat", 300, "A tug moored by the docks"),
        ("workcart", "Workcart", 300, "Cones and rails in the tunnel"),
        ("modularvehicles", "Modular Cars", 300, "Two cars outside the garage"),
        ("stables", "Stables", 300, "A barn in the morning sun"),
        ("industrial", "Garage", 250, "A lit workshop with a furnace"),
        ("boatvillage1", "Fishing Village", 250, "Huts on stilts over the sea"),
        ("boatvillage3", "Fishing Nets", 250, "Nets hung out on the pier"),
        ("boatvillage2", "Lobster Shack", 200, "A fire by the lobster shack"),
        ("desert", "Desert Rocks", 250, "Palms and rock in the heat"),
        ("mountain", "Snowy Peaks", 250, "A cold climb through dead trees"),
        ("mountain-original", "Snowy Peaks (original)", 250, "The untouched game file, 1440p 60 fps, to compare"),
        ("swamp", "Swamp", 250, "Still water and drowned trees"),
        ("rocks", "Canyon", 250, "A sunlit gap between the cliffs"),
    )
]

SHOP = [
    Offer("upkeep", "Upkeep: 2 days", "upkeep", 50, "Adds 2 days of Tool Cupboard protection to a Blueprint", True),
    *BANNERS,
    *VIDEO_BANNERS,
    Offer("frame-gold", "Notice frame: Gold", "frame", 200, "Crafted notices in gold trim"),
    Offer("frame-red", "Notice frame: Raid Red", "frame", 150, "Crafted notices in alarm red"),
    Offer("badge-survivor", "Title: Wipe Survivor", "badge", 300, "A metal plate at the top of your sidebar"),
    Offer("badge-builder", "Title: Master Builder", "badge", 500, "A metal plate at the top of your sidebar"),
]
OFFERS = {o.id: o for o in SHOP}


# ---------------------------------------------------------------- titles

@dataclass(frozen=True)
class Title:
    """A title worn on the sidebar plate. Bought ones are Shop offers with the same id; earned
    ones unlock when `stat` reaches `goal`."""
    id: str
    name: str
    item: str  # Rust item icon
    tone: str  # plate metal: copper | steel | brass
    motto: str
    stat: str | None = None  # crafted | scrap | best_wipe | learned
    goal: int = 0


TITLES = {t.id: t for t in [
    Title("badge-survivor", "Wipe Survivor", "hazmatsuit", "steel", "Lived through the wipe"),
    Title("badge-builder", "Master Builder", "building.planner", "brass", "Bases that never rust"),
    Title("feat-spawn", "Fresh Spawn", "rock", "copper", "Woke up on the beach", "crafted", 1),
    Title("feat-scavenger", "Scavenger", "hatchet", "copper", "Picks up everything", "crafted", 25),
    Title("feat-grinder", "Grinder", "jackhammer", "steel", "Never stops farming", "crafted", 100),
    Title("feat-veteran", "Veteran", "rifle.ak", "brass", "Seen it all", "crafted", 250),
    Title("feat-raider", "Raider", "explosive.timed", "steel", "Twenty Items in one wipe", "best_wipe", 20),
    Title("feat-baron", "Scrap Baron", "scrap", "brass", "Sitting on a scrap pile", "scrap", 2000),
    Title("feat-researcher", "Researcher", "researchpaper", "steel", "Learned a Blueprint", "learned", 1),
]}
EARNED_TITLES = [t for t in TITLES.values() if t.stat]


def title_stats(ledger: list[dict], learned: int, tz: timezone | None = None) -> dict:
    """What earned titles are measured by: Items crafted and scrap earned (ledger, so archived
    Items still count), the most Items crafted in one wipe, and Blueprints learned."""
    done = [r for r in ledger if r["grp"] == "completed"]
    per_wipe: dict[int, int] = {}
    for r in done:
        at = parse_dt(r["at"])
        if at:
            i = wipe_at(at, tz)["index"]
            per_wipe[i] = per_wipe.get(i, 0) + 1
    return {"crafted": len(done), "scrap": sum(r["scrap"] for r in done),
            "best_wipe": max(per_wipe.values(), default=0), "learned": learned}


def earned_titles(stats: dict) -> list[dict]:
    return [{**t.__dict__, "progress": min(stats[t.stat], t.goal), "owned": stats[t.stat] >= t.goal}
            for t in EARNED_TITLES]


def balance(earned: int, purchases: list[dict]) -> int:
    return earned - sum(p["cost"] for p in purchases)


# ---------------------------------------------------------------- Tool Cupboard (draft)

PROTECT_DAYS = 7  # crafting anything in a Blueprint protects it this long
TOPUP_DAYS = 2


def tc_status(last_craft: datetime | None, topup_until: datetime | None, open_items: int,
              now: datetime) -> dict:
    """A Blueprint's upkeep. `topup_until` is protection bought with scrap. A Blueprint
    with nothing left to craft is learned and needs no upkeep."""
    if open_items == 0:
        return {"state": "learned", "until": None}
    until = last_craft + timedelta(days=PROTECT_DAYS) if last_craft else None
    if topup_until and (until is None or topup_until > until):
        until = topup_until
    if until is None or until <= now:
        return {"state": "decaying", "until": until.isoformat() if until else None}
    left = until - now
    return {"state": "due" if left < timedelta(days=1) else "protected", "until": until.isoformat()}


def topup(current_until: datetime | None, now: datetime) -> datetime:
    base = current_until if current_until and current_until > now else now
    return base + timedelta(days=TOPUP_DAYS)


# ---------------------------------------------------------------- decay

def decay_stage(group: str, updated_at: datetime | None, now: datetime) -> int:
    """Items left in Crafting rust over: 1 after 14 idle days, 2 after 30, 3 after 60."""
    if group != "started" or not updated_at:
        return 0
    idle = (now - updated_at).days
    return 3 if idle >= 60 else 2 if idle >= 30 else 1 if idle >= 14 else 0


# ---------------------------------------------------------------- tech tree

def tech_tree(kits: list[dict], items: list[dict], groups: dict[str, str], needs: dict[str, list[str]],
              now: datetime, labels: dict[str, dict] | None = None) -> dict:
    """A Blueprint's tree: Kits are steps (each with its Items), Items with no Kit hang
    off the root. Kit state: crafted when all its live items are crafted (or the module
    is completed); locked while a needed Kit isn't crafted; else crafting/to-craft.
    One Kit is the next step: the first unlocked, unfinished Kit in tree order.
    Items with no Kit are grouped by their first tag (A-Z, untagged last)."""
    by_kit: dict[str, list[dict]] = {}
    loose: list[dict] = []
    every: list[dict] = []  # the item list under the tree, Scrapped included
    children: dict[str, int] = {}
    for it in items:
        if it.get("parent"):
            children[it["parent"]] = children.get(it["parent"], 0) + 1
    for it in items:
        node = _item_node(it, groups, now)
        node["components"] = children.get(it["id"], 0)
        every.append(node)
        if node["group"] == "cancelled":
            continue
        kit_ids = it.get("module_ids") or []
        if kit_ids:
            for k in kit_ids:
                by_kit.setdefault(k, []).append(node)
        else:
            node["tag"] = next((t for t in it.get("labels") or [] if t in (labels or {})), None)
            loose.append(node)

    kit_nodes = []
    status = {}
    for k in kits:
        its = by_kit.get(k["id"], [])
        done = sum(1 for i in its if i["group"] == "completed")
        if k.get("status") == "cancelled":
            continue
        if k.get("status") == "completed" or (its and done == len(its)):
            st = "crafted"
        elif any(i["group"] == "started" for i in its) or k.get("status") == "in-progress":
            st = "crafting"
        else:
            st = "to-craft"
        status[k["id"]] = st
        kit_nodes.append({"id": k["id"], "name": k["name"], "logo": k.get("logo_props"), "items": its,
                          "done": done, "total": len(its), "state": st,
                          "needs": [n for n in needs.get(k["id"], [])]})
    for kn in kit_nodes:
        if kn["state"] != "crafted" and any(status.get(n) != "crafted" for n in kn["needs"] if n in status):
            kn["state"] = "locked"
    nxt = next((kn["id"] for kn in kit_nodes if kn["state"] == "crafting"), None) or \
        next((kn["id"] for kn in kit_nodes if kn["state"] == "to-craft"), None)
    all_items = [i for kn in kit_nodes for i in kn["items"]] + loose
    total = len(all_items)
    done = sum(1 for i in all_items if i["group"] == "completed")
    return {"kits": kit_nodes, "loose": loose, "loose_groups": _tag_groups(loose, labels or {}),
            "items": every, "labels": labels or {},
            "next": nxt, "done": done, "total": total,
            "learned": total > 0 and done == total}


def _tag_groups(loose: list[dict], labels: dict[str, dict]) -> list[dict]:
    by_tag: dict[str | None, list[dict]] = {}
    for n in loose:
        by_tag.setdefault(n.get("tag"), []).append(n)
    out = [{"tag": t, "name": labels[t]["name"], "color": labels[t].get("color"), "items": its}
           for t, its in by_tag.items() if t]
    out.sort(key=lambda g: g["name"].lower())
    if None in by_tag:
        out.append({"tag": None, "name": "Untagged" if out else None, "color": None, "items": by_tag[None]})
    for g in out:
        g["done"] = sum(1 for i in g["items"] if i["group"] == "completed")
        g["total"] = len(g["items"])
    return out


def _item_node(it: dict, groups: dict[str, str], now: datetime) -> dict:
    group = groups.get(it.get("state"), "backlog")
    upd = parse_dt(it.get("updated_at"))
    return {"id": it["id"], "name": it["name"], "seq": it.get("sequence_id"), "group": group,
            "priority": it.get("priority"), "decay": decay_stage(group, upd, now),
            "completed_at": it.get("completed_at"), "target": it.get("target_date"),
            "parent": it.get("parent"), "labels": it.get("labels") or [], "kits": it.get("module_ids") or []}


# ---------------------------------------------------------------- feeds

SOON_DAYS = 7  # an Item due within a week shows on Home


def deadlines(items: list[dict], groups_by_project: dict[str, dict[str, str]], projects: dict[str, dict],
              today: date) -> list[dict]:
    """Open Items past their target date or due within SOON_DAYS, soonest (most overdue) first."""
    out = []
    for it in items:
        pid = it["project"]
        if groups_by_project.get(pid, {}).get(it.get("state")) not in ("backlog", "unstarted", "started"):
            continue
        raw = it.get("target_date")
        if not raw:
            continue
        try:
            due = date.fromisoformat(raw[:10])
        except ValueError:
            continue
        days = (due - today).days
        if days > SOON_DAYS:
            continue
        p = projects.get(pid, {})
        out.append({"id": it["id"], "name": it["name"], "project": pid, "project_name": p.get("name"),
                    "identifier": p.get("identifier"), "seq": it.get("sequence_id"), "logo": p.get("logo_props"),
                    "target": due.isoformat(), "days": days, "priority": it.get("priority"),
                    "group": groups_by_project[pid][it["state"]]})
    out.sort(key=lambda r: (r["days"], r["name"].lower()))
    return out

def crafted_since(items: list[dict], groups_by_project: dict[str, dict[str, str]], since: datetime,
                  projects: dict[str, dict]) -> list[dict]:
    """Items crafted after `since`, newest first, for the notices and the news feed."""
    out = []
    for it in items:
        pid = it["project"]
        if groups_by_project.get(pid, {}).get(it.get("state")) != "completed":
            continue
        at = parse_dt(it.get("completed_at"))
        if at and at > since:
            p = projects.get(pid, {})
            out.append({"id": it["id"], "name": it["name"], "project": pid, "project_name": p.get("name"),
                        "identifier": p.get("identifier"), "seq": it.get("sequence_id"),
                        "logo": p.get("logo_props"), "at": at.isoformat(),
                        "scrap": item_scrap(it, "completed")})
    out.sort(key=lambda r: r["at"], reverse=True)
    return out


def wipe_report(items: list[dict], groups_by_project: dict[str, dict[str, str]], projects: dict[str, dict],
                start: datetime, end: datetime) -> dict:
    crafted = scrapped = 0
    scrap = 0
    per: dict[str, int] = {pid: 0 for pid in projects}
    for it in items:
        g = groups_by_project.get(it["project"], {}).get(it.get("state"))
        at = parse_dt(it.get("completed_at"))
        if not at or not (start <= at < end):
            continue
        if g == "completed":
            crafted += 1
            scrap += item_scrap(it, g)
            per[it["project"]] = per.get(it["project"], 0) + 1
        elif g == "cancelled":
            scrapped += 1
    open_now = [it for it in items if groups_by_project.get(it["project"], {}).get(it.get("state"))
                in ("backlog", "unstarted", "started")]
    active = {it["project"] for it in open_now}
    return {"crafted": crafted, "scrapped": scrapped, "scrap": scrap,
            "blueprints": sorted(({"id": pid, "name": projects[pid]["name"], "logo": projects[pid].get("logo_props"),
                                   "crafted": n, "neglected": n == 0}
                                  for pid, n in per.items() if pid in active),
                                 key=lambda b: -b["crafted"])}


def parse_dt(v) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        d = datetime.fromisoformat(str(v))  # 3.11+ reads the trailing Z
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=UTC)
