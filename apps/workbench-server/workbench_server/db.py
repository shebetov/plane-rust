"""Workbench's own state in one SQLite file: what Plane has no place for.
  kv        settings and small state (last visit, seen wipes, wipe offset, meta)
  crafted   the scrap ledger: every item ever seen crafted (or scrapped), kept even after
            Plane archives it, so earned scrap never shrinks
  purchases shop purchases
  topups    Tool Cupboard protection bought with scrap, per Blueprint
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import UTC, datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS crafted (
  item_id TEXT PRIMARY KEY, project TEXT NOT NULL, name TEXT NOT NULL, seq INTEGER,
  grp TEXT NOT NULL, at TEXT NOT NULL, scrap INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, offer TEXT NOT NULL,
  cost INTEGER NOT NULL, target TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topups (project TEXT PRIMARY KEY, until TEXT NOT NULL);
"""


class DB:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()

    def get(self, key: str, default=None):
        row = self.conn.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def put(self, key: str, value) -> None:
        with self.lock:
            self.conn.execute("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                              (key, json.dumps(value)))

    # ---- ledger
    def ledger_upsert(self, rows: list[tuple]) -> int:
        """rows: (item_id, project, name, seq, grp, at, scrap). Returns how many are new."""
        with self.lock:
            before = self.conn.execute("SELECT COUNT(*) FROM crafted").fetchone()[0]
            self.conn.executemany(
                "INSERT INTO crafted VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET "
                "project=excluded.project, name=excluded.name, grp=excluded.grp, at=excluded.at, scrap=excluded.scrap",
                rows)
            return self.conn.execute("SELECT COUNT(*) FROM crafted").fetchone()[0] - before

    def ledger_remove(self, item_ids: list[str]) -> None:
        with self.lock:
            self.conn.executemany("DELETE FROM crafted WHERE item_id=?", [(i,) for i in item_ids])

    def ledger(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM crafted ORDER BY at DESC")]

    def earned(self) -> int:
        return self.conn.execute("SELECT COALESCE(SUM(scrap),0) FROM crafted").fetchone()[0]

    # ---- shop
    def purchases(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute("SELECT * FROM purchases ORDER BY id")]

    def buy(self, offer: str, cost: int, target: str | None) -> None:
        with self.lock:
            self.conn.execute("INSERT INTO purchases(offer,cost,target,at) VALUES(?,?,?,?)",
                              (offer, cost, target, datetime.now(UTC).isoformat()))

    # ---- Tool Cupboard
    def topups(self) -> dict[str, str]:
        return {r["project"]: r["until"] for r in self.conn.execute("SELECT * FROM topups")}

    def set_topup(self, project: str, until: str) -> None:
        with self.lock:
            self.conn.execute("INSERT INTO topups VALUES(?,?) ON CONFLICT(project) DO UPDATE SET until=excluded.until",
                              (project, until))
