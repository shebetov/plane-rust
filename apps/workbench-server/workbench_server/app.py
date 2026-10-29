"""Workbench companion service (Starlette). Lives next to Plane on the internal network;
the proxy routes /wb/* here. Browser calls are authenticated with the user's Plane session
cookie (checked against Plane); Plane's webhooks are checked with their HMAC signature.

Env: PLANE_URL (http://wb-api:8000), PLANE_API_KEY, WB_SLUG (rust), WB_DB (/data/workbench.db),
     WEBHOOK_SECRET (Plane webhook secret), WIPE_SYNC (1 = create server Wipes), TZ.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import json
import logging
import os
import re
from datetime import UTC, datetime, time, timedelta

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

from . import game
from .db import DB
from .plane import Plane

log = logging.getLogger("workbench")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per Plane call is noise

RUST_STATE = {"backlog": "Locked", "unstarted": "To Craft", "started": "Crafting",
              "completed": "Crafted", "cancelled": "Scrapped"}
PLANE_DEFAULT_STATE = {"Backlog", "Todo", "In Progress", "Done", "Cancelled"}
OPEN = ("backlog", "unstarted", "started")
TTL = 60


def now() -> datetime:
    return datetime.now(UTC)


class World:
    """A cached copy of the Plane data the game needs, refreshed every TTL seconds and
    right after a webhook. Comparing snapshots is how state changes become events."""

    def __init__(self, plane: Plane, db: DB):
        self.plane, self.db = plane, db
        self.projects: dict[str, dict] = {}
        self.groups: dict[str, dict[str, str]] = {}
        self.items: dict[str, list[dict]] = {}
        self.item_group: dict[str, str] = {}
        self.fetched = 0.0
        self.lock = asyncio.Lock()
        self.sem = asyncio.Semaphore(4)
        self.listeners: set[asyncio.Queue] = set()
        self.kit_cache: dict[str, tuple[float, dict]] = {}

    # ---- loading
    async def ensure(self, force: bool = False) -> None:
        loop = asyncio.get_running_loop()
        if not force and self.projects and loop.time() - self.fetched < TTL:
            return
        async with self.lock:
            if not force and self.projects and loop.time() - self.fetched < TTL:
                return
            projects = {p["id"]: p for p in await self.plane.projects()}
            results = await asyncio.gather(*(self._load_project(pid) for pid in projects))
            self.projects = projects
            for pid, (groups, items) in zip(projects, results):
                self.groups[pid], self.items[pid] = groups, items
            self._after_load(set(projects), first=not self.item_group)
            self.fetched = loop.time()

    async def refresh_project(self, pid: str) -> list[dict]:
        async with self.lock:
            if pid not in self.projects:
                self.projects = {p["id"]: p for p in await self.plane.projects()}
            groups, items = await self._load_project(pid)
            self.groups[pid], self.items[pid] = groups, items
            self.kit_cache.pop(pid, None)
            return self._after_load({pid}, first=False)

    async def _load_project(self, pid: str):
        async with self.sem:
            states = await self.plane.states(pid)
            items = await self.plane.items(pid)
        for s in states:  # Blueprints made in the UI get Plane's default names: Rust them
            if s["name"] in PLANE_DEFAULT_STATE and s["group"] in RUST_STATE:
                with contextlib.suppress(Exception):
                    await self.plane.rename_state(pid, s["id"], RUST_STATE[s["group"]])
        for it in items:
            it["project"] = pid
        return {s["id"]: s["group"] for s in states}, items

    def _after_load(self, pids: set[str], first: bool) -> list[dict]:
        """Update the scrap ledger and turn group changes into events."""
        events, rows, reopened = [], [], []
        for pid in pids:
            for it in self.items.get(pid, []):
                g = self.groups[pid].get(it["state"], "backlog")
                prev = self.item_group.get(it["id"])
                self.item_group[it["id"]] = g
                if g in ("completed", "cancelled"):
                    at = it.get("completed_at") or it.get("updated_at") or now().isoformat()
                    rows.append((it["id"], pid, it["name"], it.get("sequence_id"), g, at, game.item_scrap(it, g)))
                elif prev in ("completed", "cancelled"):
                    reopened.append(it["id"])
                if not first and prev is not None and prev != g:
                    events.append(self._event(it, pid, prev, g))
        if rows:
            self.db.ledger_upsert(rows)
        if reopened:
            self.db.ledger_remove(reopened)
        for e in events:
            self.broadcast(e)
        return events

    def _event(self, it: dict, pid: str, prev: str, g: str) -> dict:
        p = self.projects.get(pid, {})
        kind = {"completed": "crafted", "cancelled": "scrapped", "started": "crafting"}.get(g, "moved")
        ev = {"type": kind, "item": {"id": it["id"], "name": it["name"], "seq": it.get("sequence_id")},
              "project": {"id": pid, "name": p.get("name"), "identifier": p.get("identifier"),
                          "logo": p.get("logo_props")},
              "from": prev, "to": g, "scrap": game.item_scrap(it, g), "at": now().isoformat()}
        if g == "completed":
            items = self.items.get(pid, [])
            live = [i for i in items if self.groups[pid].get(i["state"]) != "cancelled"]
            if live and all(self.groups[pid].get(i["state"]) == "completed" for i in live):
                ev["learned"] = True  # the whole Blueprint is crafted
        return ev

    # ---- live events (SSE)
    def broadcast(self, event: dict) -> None:
        for q in list(self.listeners):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(event)

    # ---- derived views
    def all_items(self) -> list[dict]:
        return [it for items in self.items.values() for it in items]

    def open_count(self, pid: str) -> int:
        return sum(1 for it in self.items.get(pid, []) if self.groups[pid].get(it["state"]) in OPEN)

    def last_craft(self, pid: str) -> datetime | None:
        ats = [game.parse_dt(r["at"]) for r in self.db.ledger() if r["project"] == pid and r["grp"] == "completed"]
        return max((a for a in ats if a), default=None)

    def tc(self, pid: str) -> dict:
        if not any(self.groups[pid].get(i["state"]) != "cancelled" for i in self.items.get(pid, [])):
            return {"state": "empty", "until": None}  # nothing planned yet: no upkeep
        top = game.parse_dt(self.db.topups().get(pid))
        return game.tc_status(self.last_craft(pid), top, self.open_count(pid), now())

    async def kit_map(self, pid: str) -> dict:
        """Kits of a Blueprint and which items are in each (cached like the rest)."""
        loop = asyncio.get_running_loop()
        hit = self.kit_cache.get(pid)
        if hit and loop.time() - hit[0] < TTL:
            return hit[1]
        mods = await self.plane.modules(pid)
        members: dict[str, list[str]] = {}
        for m in mods:
            for mi in await self.plane.module_items(pid, m["id"]):
                iid = mi.get("issue") or mi.get("id")
                members.setdefault(iid, []).append(m["id"])
        out = {"modules": mods, "members": members}
        self.kit_cache[pid] = (loop.time(), out)
        return out


# ---------------------------------------------------------------- app

def wipe_info(db: DB) -> dict:
    w = game.wipe_at(now())
    offset = db.get("wipe_offset", 0)
    return {"index": w["index"], "number": w["index"] + 1 + offset, "start": w["start"].isoformat(),
            "end": w["end"].isoformat()}


def local_midnight(d) -> datetime:
    return datetime.combine(d, time(0, 0)).astimezone()


def create_app(plane: Plane | None = None, db: DB | None = None, wipe_sync: bool | None = None) -> Starlette:
    plane = plane or Plane(os.environ["PLANE_URL"], os.environ["PLANE_API_KEY"], os.environ.get("WB_SLUG", "rust"))
    db = db or DB(os.environ.get("WB_DB", "/data/workbench.db"))
    world = World(plane, db)
    secret = os.environ.get("WEBHOOK_SECRET", "")
    sync = wipe_sync if wipe_sync is not None else os.environ.get("WIPE_SYNC", "1") == "1"

    async def user_of(request: Request):
        return await plane.session_user(request.headers.get("cookie", ""))

    def authed(fn):
        async def wrapper(request: Request):
            if not await user_of(request):
                return JSONResponse({"error": "sign in"}, status_code=401)
            return await fn(request)
        return wrapper

    # ---- endpoints
    async def health(_):
        return JSONResponse({"ok": True})

    @authed
    async def state(_):
        await world.ensure()
        earned, purchases = db.earned(), db.purchases()
        owned = sorted({p["offer"] for p in purchases if not game.OFFERS.get(p["offer"], game.SHOP[0]).repeat})
        return JSONResponse({
            "wipe": wipe_info(db),
            "scrap": {"earned": earned, "spent": earned - game.balance(earned, purchases),
                      "balance": game.balance(earned, purchases)},
            "owned": owned, "equipped": db.get("equipped", {}),
            "tc": {pid: world.tc(pid) for pid in world.projects},
            "last_visit": db.get("last_visit"),
        })

    @authed
    async def visit(_):
        await world.ensure()
        last = game.parse_dt(db.get("last_visit"))
        db.put("last_visit", now().isoformat())
        if not last:
            return JSONResponse({"since": None, "crafted": []})
        crafted = game.crafted_since(world.all_items(), world.groups, last, world.projects)
        return JSONResponse({"since": last.isoformat(), "crafted": crafted[:8]})

    @authed
    async def home(_):
        await world.ensure()
        ledger = db.ledger()
        bps = []
        for pid, p in world.projects.items():
            items = world.items.get(pid, [])
            live = [i for i in items if world.groups[pid].get(i["state"]) != "cancelled"]
            done = sum(1 for i in live if world.groups[pid].get(i["state"]) == "completed")
            lc = world.last_craft(pid)
            bps.append({"id": pid, "name": p["name"], "identifier": p["identifier"], "logo": p.get("logo_props"),
                        "open": world.open_count(pid), "done": done, "total": len(live),
                        "crafting": sum(1 for i in items if world.groups[pid].get(i["state"]) == "started"),
                        "last_craft": lc.isoformat() if lc else None, "tc": world.tc(pid),
                        "updated_at": max((i.get("updated_at") or "" for i in items), default=None)})
        bps.sort(key=lambda b: (b["open"] == 0, -(game.parse_dt(b["updated_at"]) or now()).timestamp()))
        news = [r for r in ledger if r["grp"] == "completed"][:12]
        for r in news:
            p = world.projects.get(r["project"], {})
            r.update(project_name=p.get("name"), identifier=p.get("identifier"), logo=p.get("logo_props"))
        w = wipe_info(db)
        ws = local_midnight(game.WIPE_EPOCH + timedelta(days=w["index"] * game.WIPE_DAYS))
        this_wipe = [r for r in ledger if r["grp"] == "completed" and (game.parse_dt(r["at"]) or ws) >= ws]
        w["crafted"], w["scrap"] = len(this_wipe), sum(r["scrap"] for r in this_wipe)
        seen = db.get("seen_wipes", [])
        report_due = w["index"] - 1 if w["index"] >= 1 and (w["index"] - 1) not in seen else None
        return JSONResponse({"wipe": w, "blueprints": bps, "news": news, "report_due": report_due})

    @authed
    async def wipe_report(request: Request):
        await world.ensure()
        idx = int(request.query_params.get("index", game.wipe_at(now())["index"] - 1))
        start = game.WIPE_EPOCH + timedelta(days=idx * game.WIPE_DAYS)
        s, e = local_midnight(start), local_midnight(start + timedelta(days=game.WIPE_DAYS))
        ledger_items = [{"id": r["item_id"], "project": r["project"], "name": r["name"],
                         "state": "_c" if r["grp"] == "completed" else "_x", "completed_at": r["at"],
                         "priority": None, "parent": None} for r in db.ledger()]
        groups = {pid: {**g, "_c": "completed", "_x": "cancelled"} for pid, g in world.groups.items()}
        rep = game.wipe_report(ledger_items + [i for i in world.all_items()
                                               if world.groups[i["project"]].get(i["state"]) in OPEN],
                               groups, world.projects, s, e)
        rep["scrap"] = sum(r["scrap"] for r in db.ledger() if r["grp"] == "completed"
                           and s <= (game.parse_dt(r["at"]) or s) < e)
        offset = db.get("wipe_offset", 0)
        # craft next: the next step of up to three active Blueprints
        nxt = []
        for b in sorted(world.projects, key=lambda pid: -world.open_count(pid))[:6]:
            tree = await tree_of(b)
            if tree["next"]:
                kit = next(k for k in tree["kits"] if k["id"] == tree["next"])
                nxt.append({"blueprint": world.projects[b]["name"], "kit": kit["name"], "logo": kit.get("logo")})
            if len(nxt) == 3:
                break
        return JSONResponse({"index": idx, "number": idx + 1 + offset, "start": s.isoformat(), "end": e.isoformat(),
                             **rep, "next": nxt})

    @authed
    async def wipe_seen(request: Request):
        body = await request.json()
        seen = set(db.get("seen_wipes", []))
        seen.add(int(body["index"]))
        db.put("seen_wipes", sorted(seen))
        return JSONResponse({"ok": True})

    async def tree_of(pid: str) -> dict:
        km = await world.kit_map(pid)
        items = [{**i, "module_ids": km["members"].get(i["id"], [])} for i in world.items.get(pid, [])]
        meta = db.get("meta", {}).get("kits", {})
        needs = {k: v.get("needs", []) for k, v in meta.items()}
        return game.tech_tree(km["modules"], items, world.groups.get(pid, {}), needs, now())

    @authed
    async def tree(request: Request):
        await world.ensure()
        pid = request.path_params["pid"]
        if pid not in world.projects:
            return JSONResponse({"error": "no such blueprint"}, status_code=404)
        p = world.projects[pid]
        bmeta = db.get("meta", {}).get("blueprints", {}).get(pid, {})
        return JSONResponse({"blueprint": {"id": pid, "name": p["name"], "identifier": p["identifier"],
                                           "logo": p.get("logo_props"), "description": p.get("description"),
                                           "target": bmeta.get("target"), "domain": bmeta.get("domain")},
                             "tc": world.tc(pid), **(await tree_of(pid))})

    @authed
    async def crafting(_):
        """The craft queue: every Item in Crafting, oldest activity first (decay shows)."""
        await world.ensure()
        out = []
        for pid, items in world.items.items():
            p = world.projects[pid]
            for it in items:
                if world.groups[pid].get(it["state"]) != "started":
                    continue
                upd = game.parse_dt(it.get("updated_at"))
                out.append({"id": it["id"], "name": it["name"], "seq": it.get("sequence_id"), "project": pid,
                            "identifier": p["identifier"], "logo": p.get("logo_props"), "priority": it.get("priority"),
                            "updated_at": it.get("updated_at"), "decay": game.decay_stage("started", upd, now())})
        out.sort(key=lambda r: r["updated_at"] or "")
        return JSONResponse({"items": out})

    @authed
    async def shop(_):
        earned, purchases = db.earned(), db.purchases()
        owned = {p["offer"] for p in purchases}
        return JSONResponse({"balance": game.balance(earned, purchases), "equipped": db.get("equipped", {}),
                             "offers": [{**o.__dict__, "owned": o.id in owned and not o.repeat} for o in game.SHOP]})

    @authed
    async def buy(request: Request):
        body = await request.json()
        offer = game.OFFERS.get(body.get("offer"))
        if not offer:
            return JSONResponse({"error": "unknown offer"}, status_code=400)
        earned, purchases = db.earned(), db.purchases()
        if not offer.repeat and any(p["offer"] == offer.id for p in purchases):
            return JSONResponse({"error": "already owned"}, status_code=409)
        if game.balance(earned, purchases) < offer.cost:
            return JSONResponse({"error": "not enough scrap"}, status_code=402)
        target = body.get("target")
        if offer.kind == "upkeep":
            await world.ensure()
            if target not in world.projects:
                return JSONResponse({"error": "pick a blueprint"}, status_code=400)
            cur = game.parse_dt(world.tc(target)["until"])
            db.set_topup(target, game.topup(cur, now()).isoformat())
        db.buy(offer.id, offer.cost, target)
        if offer.kind in ("banner", "frame", "badge"):
            eq = db.get("equipped", {})
            eq[offer.kind] = offer.id
            db.put("equipped", eq)
        return JSONResponse({"ok": True, "balance": game.balance(db.earned(), db.purchases())})

    @authed
    async def equip(request: Request):
        body = await request.json()
        kind, oid = body.get("kind"), body.get("offer")
        if kind not in ("banner", "frame", "badge"):
            return JSONResponse({"error": "bad kind"}, status_code=400)
        if oid and not any(p["offer"] == oid for p in db.purchases()):
            return JSONResponse({"error": "not owned"}, status_code=403)
        eq = db.get("equipped", {})
        if oid:
            eq[kind] = oid
        else:
            eq.pop(kind, None)
        db.put("equipped", eq)
        return JSONResponse({"ok": True, "equipped": eq})

    @authed
    async def put_meta(request: Request):
        db.put("meta", await request.json())
        return JSONResponse({"ok": True})

    @authed
    async def events(request: Request):
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        world.listeners.add(q)

        async def stream():
            try:
                yield "retry: 5000\n\n"
                while True:
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=25)
                        yield f"data: {json.dumps(ev)}\n\n"
                    except TimeoutError:
                        yield ": ping\n\n"
                    if await request.is_disconnected():
                        break
            finally:
                world.listeners.discard(q)

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    async def webhook(request: Request):
        body = await request.body()
        sig = request.headers.get("x-plane-signature", "")
        if secret:
            try:
                canon = json.dumps(json.loads(body)).encode()
            except ValueError:
                canon = body
            ok = any(hmac.compare_digest(hmac.new(secret.encode(), b, hashlib.sha256).hexdigest(), sig)
                     for b in (body, canon))
            if not ok:
                return JSONResponse({"error": "bad signature"}, status_code=401)
        try:
            payload = json.loads(body)
        except ValueError:
            return JSONResponse({"error": "bad json"}, status_code=400)
        data = payload.get("data") or {}
        pid = data.get("project") or data.get("project_id")
        if isinstance(pid, dict):
            pid = pid.get("id")
        if payload.get("event") in ("issue", "issue_comment", "module", "cycle") and pid:
            await world.ensure()
            await world.refresh_project(str(pid))
        elif payload.get("event") == "project":
            await world.ensure(force=True)
        return JSONResponse({"ok": True})

    # ---- server wipes: the same Wipe in every active Blueprint, unfinished items roll over
    async def sync_wipes():
        await world.ensure(force=True)
        if db.get("wipe_offset") is None:
            nums = [int(m.group(1)) for pid in world.projects for c in await plane.cycles(pid)
                    if (m := re.match(r"Wipe #(\d+)", c.get("name", "")))]
            db.put("wipe_offset", max(nums, default=0))
        w = wipe_info(db)
        start, end = local_midnight(game.WIPE_EPOCH + timedelta(days=w["index"] * game.WIPE_DAYS)), None
        end = start + timedelta(days=game.WIPE_DAYS) - timedelta(seconds=1)
        name, prev_name = game.wipe_name(w["number"]), game.wipe_name(w["number"] - 1)
        for pid, p in world.projects.items():
            if world.open_count(pid) == 0 or not p.get("cycle_view", True):
                continue
            cycles = await plane.cycles(pid)
            cur = next((c for c in cycles if c["name"] == name), None)
            if not cur:
                cur = await plane.create_cycle(pid, name, start.isoformat(), end.isoformat())
                log.info("created %s in %s", name, p["name"])
                prev = next((c for c in cycles if c["name"] == prev_name), None)
                if prev:
                    with contextlib.suppress(Exception):
                        await plane.transfer(pid, prev["id"], cur["id"])

    async def scheduler():
        while True:
            try:
                if sync:
                    await sync_wipes()
            except Exception:  # keep the loop alive; the next run retries
                log.exception("wipe sync failed")
            await asyncio.sleep(600)

    @contextlib.asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(scheduler())
        yield
        task.cancel()

    routes = [
        Route("/wb/health", health),
        Route("/wb/api/state", state),
        Route("/wb/api/visit", visit, methods=["POST"]),
        Route("/wb/api/home", home),
        Route("/wb/api/wipe-report", wipe_report),
        Route("/wb/api/wipe-seen", wipe_seen, methods=["POST"]),
        Route("/wb/api/tree/{pid}", tree),
        Route("/wb/api/crafting", crafting),
        Route("/wb/api/shop", shop),
        Route("/wb/api/buy", buy, methods=["POST"]),
        Route("/wb/api/equip", equip, methods=["POST"]),
        Route("/wb/api/meta", put_meta, methods=["PUT"]),
        Route("/wb/api/events", events),
        Route("/wb/webhook", webhook, methods=["POST"]),
    ]
    app = Starlette(routes=routes, lifespan=lifespan)
    app.state.world, app.state.db = world, db
    return app
