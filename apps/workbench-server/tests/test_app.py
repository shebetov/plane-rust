"""The service against a fake Plane: auth, scrap ledger, events, shop, webhook signature."""

import hashlib
import hmac
import json
from datetime import UTC, datetime

import pytest
from starlette.testclient import TestClient

from workbench_server.app import create_app
from workbench_server.db import DB

STATES = [{"id": "s-b", "name": "Backlog", "group": "backlog"}, {"id": "s-u", "name": "To Craft", "group": "unstarted"},
          {"id": "s-s", "name": "Crafting", "group": "started"}, {"id": "s-c", "name": "Crafted", "group": "completed"},
          {"id": "s-x", "name": "Scrapped", "group": "cancelled"}]


class FakePlane:
    def __init__(self):
        self.data = {"p1": [
            {"id": "i1", "name": "Quit", "state": "s-c", "priority": "urgent", "sequence_id": 1,
             "completed_at": "2026-10-20T10:00:00Z", "updated_at": "2026-10-20T10:00:00Z"},
            {"id": "i2", "name": "Run", "state": "s-u", "priority": "low", "sequence_id": 2,
             "updated_at": "2026-10-28T10:00:00Z"},
        ]}
        self.renamed = []

    async def projects(self):
        return [{"id": "p1", "name": "Smoke-free", "identifier": "SF", "logo_props": {}}]

    async def states(self, pid):
        return STATES

    async def items(self, pid):
        return [dict(i) for i in self.data[pid]]

    async def modules(self, pid):
        return [{"id": "k1", "name": "Kit", "status": "in-progress"}]

    async def module_items(self, pid, mid):
        return [{"id": "i1"}, {"id": "i2"}]

    async def cycles(self, pid):
        return []

    async def rename_state(self, pid, sid, name):
        self.renamed.append((sid, name))

    async def session_user(self, cookie):
        return {"id": "u1"} if "session-id=ok" in cookie else None


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("WEBHOOK_SECRET", "shh")
    plane = FakePlane()
    app = create_app(plane=plane, db=DB(str(tmp_path / "wb.db")), wipe_sync=False)
    with TestClient(app) as c:
        c.cookies.set("session-id", "ok")
        yield c, plane, app


def test_requires_a_plane_session(env):
    c, _, _ = env
    c.cookies.clear()
    assert c.get("/wb/api/state").status_code == 401
    assert c.get("/wb/health").json() == {"ok": True}


def test_state_counts_scrap_from_the_ledger_and_renames_default_states(env):
    c, plane, _ = env
    s = c.get("/wb/api/state").json()
    assert s["scrap"] == {"earned": 40, "spent": 0, "balance": 40}  # one Armored item crafted
    assert s["tc"]["p1"]["state"] in ("decaying", "protected", "due")
    assert ("s-b", "Locked") in plane.renamed  # Plane's default "Backlog" became Rust's


def test_ledger_keeps_scrap_after_plane_archives_the_item(env):
    c, plane, app = env
    c.get("/wb/api/state")
    plane.data["p1"] = [i for i in plane.data["p1"] if i["id"] != "i1"]  # archived: gone from the list
    app.state.world.fetched = 0
    assert c.get("/wb/api/state").json()["scrap"]["earned"] == 40


def test_shop_buy_needs_scrap_and_owns_cosmetics_once(env):
    c, _, _ = env
    assert c.post("/wb/api/buy", json={"offer": "banner-snow"}).status_code == 402
    assert c.post("/wb/api/buy", json={"offer": "nope"}).status_code == 400


def test_upkeep_topup_protects_the_blueprint(env):
    c, _, _ = env
    r = c.post("/wb/api/buy", json={"offer": "upkeep", "target": "p1"})
    assert r.status_code == 402  # 40 scrap < 50


def test_webhook_signature_and_crafted_event(env):
    c, plane, app = env
    c.get("/wb/api/state")
    world = app.state.world
    import asyncio
    q = asyncio.Queue()
    world.listeners.add(q)
    plane.data["p1"][1]["state"] = "s-c"
    plane.data["p1"][1]["completed_at"] = datetime.now(UTC).isoformat()
    payload = {"event": "issue", "action": "update", "data": {"id": "i2", "project": "p1"}}
    body = json.dumps(payload).encode()
    assert c.post("/wb/webhook", content=body, headers={"X-Plane-Signature": "nope"}).status_code == 401
    sig = hmac.new(b"shh", body, hashlib.sha256).hexdigest()
    assert c.post("/wb/webhook", content=body, headers={"X-Plane-Signature": sig}).status_code == 200
    ev = q.get_nowait()
    assert ev["type"] == "crafted" and ev["item"]["name"] == "Run" and ev["learned"] is True
    assert c.get("/wb/api/state").json()["scrap"]["earned"] == 50


def test_tree_and_home(env):
    c, _, _ = env
    t = c.get("/wb/api/tree/p1").json()
    assert t["kits"][0]["state"] == "crafting" and t["next"] == "k1" and (t["done"], t["total"]) == (1, 2)
    h = c.get("/wb/api/home").json()
    assert h["blueprints"][0]["open"] == 1 and h["news"][0]["name"] == "Quit"
    assert c.get("/wb/api/tree/nope").status_code == 404


def test_visit_returns_items_crafted_since_last_time(env):
    c, plane, app = env
    assert c.post("/wb/api/visit").json() == {"since": None, "crafted": []}
    plane.data["p1"][1].update(state="s-c", completed_at=datetime.now(UTC).isoformat())
    app.state.world.fetched = 0
    r = c.post("/wb/api/visit").json()
    assert [x["name"] for x in r["crafted"]] == ["Run"]


def test_a_blueprint_with_no_items_needs_no_upkeep(env):
    c, plane, app = env
    plane.data["p1"] = []
    app.state.world.fetched = 0
    assert c.get("/wb/api/state").json()["tc"]["p1"] == {"state": "empty", "until": None}


def test_craft_queue_lists_items_in_crafting(env):
    c, plane, app = env
    plane.data["p1"][1]["state"] = "s-s"
    app.state.world.fetched = 0
    q = c.get("/wb/api/crafting").json()["items"]
    assert [(i["name"], i["identifier"], i["seq"]) for i in q] == [("Run", "SF", 2)]
