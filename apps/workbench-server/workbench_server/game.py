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


SHOP = [
    Offer("upkeep", "Upkeep: 2 days", "upkeep", 50, "Adds 2 days of Tool Cupboard protection to a Blueprint", True),
    Offer("banner-snow", "Banner: Arctic Base", "banner", 120, "A cold, white main-menu scene"),
    Offer("banner-desert", "Banner: Desert Outpost", "banner", 120, "Sand, heat haze and rusted metal"),
    Offer("banner-night", "Banner: Night Raid", "banner", 160, "Moonlight over a sleeping base"),
    Offer("frame-gold", "Notice frame: Gold", "frame", 200, "Crafted notices in gold trim"),
    Offer("frame-red", "Notice frame: Raid Red", "frame", 150, "Crafted notices in alarm red"),
    Offer("badge-survivor", "Title: Wipe Survivor", "badge", 300, "Shown next to your name on the main menu"),
    Offer("badge-builder", "Title: Master Builder", "badge", 500, "Shown next to your name on the main menu"),
]
OFFERS = {o.id: o for o in SHOP}


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
