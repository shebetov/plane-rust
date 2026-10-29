from datetime import UTC, date, datetime, timedelta

from workbench_server import game

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def test_wipes_are_every_second_thursday_from_the_epoch():
    w = game.wipe_at(datetime(2026, 10, 29, 9, 0, tzinfo=UTC), UTC)
    assert w == {"index": 0, "start": date(2026, 10, 29), "end": date(2026, 11, 12)}
    assert game.wipe_at(datetime(2026, 11, 11, 23, 0, tzinfo=UTC), UTC)["index"] == 0
    assert game.wipe_at(datetime(2026, 11, 12, 0, 1, tzinfo=UTC), UTC)["index"] == 1


def test_scrap_by_building_grade_and_components():
    assert game.item_scrap({"priority": "urgent"}, "completed") == 40
    assert game.item_scrap({"priority": "none"}, "completed") == 5
    assert game.item_scrap({"priority": "high", "parent": "x"}, "completed") == game.COMPONENT_SCRAP
    assert game.item_scrap({"priority": "urgent"}, "cancelled") == 0
    assert game.balance(100, [{"cost": 30}, {"cost": 50}]) == 20


def test_tool_cupboard_protects_for_a_week_after_a_craft():
    craft = NOW - timedelta(days=2)
    assert game.tc_status(craft, None, 3, NOW)["state"] == "protected"
    assert game.tc_status(NOW - timedelta(days=6, hours=12), None, 3, NOW)["state"] == "due"
    assert game.tc_status(NOW - timedelta(days=8), None, 3, NOW)["state"] == "decaying"
    assert game.tc_status(None, None, 3, NOW) == {"state": "decaying", "until": None}
    assert game.tc_status(None, None, 0, NOW)["state"] == "learned"
    # bought upkeep wins when it lasts longer
    st = game.tc_status(NOW - timedelta(days=8), NOW + timedelta(days=1, hours=1), 3, NOW)
    assert st["state"] == "protected"


def test_topup_extends_from_now_or_from_current_protection():
    assert game.topup(None, NOW) == NOW + timedelta(days=2)
    assert game.topup(NOW + timedelta(days=3), NOW) == NOW + timedelta(days=5)
    assert game.topup(NOW - timedelta(days=3), NOW) == NOW + timedelta(days=2)


def test_decay_only_for_crafting_items():
    assert game.decay_stage("started", NOW - timedelta(days=13), NOW) == 0
    assert game.decay_stage("started", NOW - timedelta(days=14), NOW) == 1
    assert game.decay_stage("started", NOW - timedelta(days=31), NOW) == 2
    assert game.decay_stage("started", NOW - timedelta(days=61), NOW) == 3
    assert game.decay_stage("unstarted", NOW - timedelta(days=90), NOW) == 0


GROUPS = {"s-b": "backlog", "s-u": "unstarted", "s-s": "started", "s-c": "completed", "s-x": "cancelled"}


def item(i, state, kits=(), **kw):
    return {"id": i, "name": i, "state": state, "module_ids": list(kits), "updated_at": NOW.isoformat(), **kw}


def test_tech_tree_states_locks_and_next_step():
    kits = [{"id": "k1", "name": "Kit 1"}, {"id": "k2", "name": "Kit 2"}, {"id": "k3", "name": "Kit 3"}]
    items = [item("a", "s-c", ["k1"]), item("b", "s-c", ["k1"]), item("c", "s-u", ["k2"]),
             item("d", "s-u", ["k3"]), item("e", "s-x", ["k3"]), item("loose", "s-b")]
    t = game.tech_tree(kits, items, GROUPS, {"k3": ["k2"]}, NOW)
    st = {k["id"]: k["state"] for k in t["kits"]}
    assert st == {"k1": "crafted", "k2": "to-craft", "k3": "locked"}
    assert t["next"] == "k2"
    assert [i["id"] for i in t["loose"]] == ["loose"]
    assert (t["done"], t["total"], t["learned"]) == (2, 5, False)  # cancelled items don't count


def test_items_without_a_kit_are_grouped_by_tag():
    labels = {"t-h": {"name": "Health", "color": "#f00"}, "t-s": {"name": "Self", "color": "#00f"}}
    items = [{**item("a", "s-c"), "labels": ["t-s"]}, {**item("b", "s-u"), "labels": ["t-h", "t-s"]},
             {**item("c", "s-u"), "labels": ["gone"]}, item("d", "s-b")]
    g = game.tech_tree([], items, GROUPS, {}, NOW, labels=labels)["loose_groups"]
    assert [(x["name"], [i["id"] for i in x["items"]], x["done"]) for x in g] == [
        ("Health", ["b"], 0), ("Self", ["a"], 1), ("Untagged", ["c", "d"], 0)]
    untagged_only = game.tech_tree([], [item("d", "s-b")], GROUPS, {}, NOW)["loose_groups"]
    assert [x["name"] for x in untagged_only] == [None]


def test_tech_tree_prefers_the_kit_being_crafted():
    kits = [{"id": "k1", "name": "1"}, {"id": "k2", "name": "2"}]
    t = game.tech_tree(kits, [item("a", "s-u", ["k1"]), item("b", "s-s", ["k2"])], GROUPS, {}, NOW)
    assert t["next"] == "k2"


def test_crafted_since_and_wipe_report():
    projects = {"p1": {"name": "Smoke-free", "identifier": "SF"}, "p2": {"name": "Voice", "identifier": "V"}}
    gbp = {"p1": GROUPS, "p2": GROUPS}
    items = [
        {"id": "a", "name": "A", "project": "p1", "state": "s-c", "priority": "high",
         "completed_at": (NOW - timedelta(days=1)).isoformat()},
        {"id": "b", "name": "B", "project": "p1", "state": "s-c", "priority": "low",
         "completed_at": (NOW - timedelta(days=20)).isoformat()},
        {"id": "c", "name": "C", "project": "p2", "state": "s-x", "completed_at": (NOW - timedelta(days=2)).isoformat()},
        {"id": "d", "name": "D", "project": "p2", "state": "s-u"},
    ]
    feed = game.crafted_since(items, gbp, NOW - timedelta(days=7), projects)
    assert [f["id"] for f in feed] == ["a"] and feed[0]["scrap"] == 25
    rep = game.wipe_report(items, gbp, projects, NOW - timedelta(days=7), NOW)
    assert (rep["crafted"], rep["scrapped"], rep["scrap"]) == (1, 1, 25)
    # only Blueprints with open items are listed; p2 crafted nothing -> neglected
    assert [(b["id"], b["neglected"]) for b in rep["blueprints"]] == [("p2", True)]


def test_tech_tree_lists_every_item_with_its_attributes():
    items = [{**item("a", "s-u", ["k1"]), "labels": ["t"], "target_date": "2026-11-20"},
             {**item("b", "s-x"), "parent": "a"}]
    t = game.tech_tree([{"id": "k1", "name": "K"}], items, GROUPS, {}, NOW, labels={"t": {"name": "T"}})
    a, b = t["items"]
    assert (a["kits"], a["labels"], a["target"], a["components"]) == (["k1"], ["t"], "2026-11-20", 1)
    assert (b["group"], b["parent"]) == ("cancelled", "a")
    assert t["labels"] == {"t": {"name": "T"}}
