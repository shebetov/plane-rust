"""A small client for Plane's public REST API (/api/v1), used with a personal API token,
plus a session check that asks Plane who a browser cookie belongs to."""

from __future__ import annotations

import asyncio
import time

import httpx


class Plane:
    def __init__(self, base: str, key: str, slug: str):
        self.base = base.rstrip("/")
        self.slug = slug
        self.http = httpx.AsyncClient(base_url=f"{self.base}/api/v1/workspaces/{slug}",
                                      headers={"X-API-Key": key}, timeout=30)
        self.session_http = httpx.AsyncClient(base_url=self.base, timeout=10)
        self._sessions: dict[str, tuple[float, dict | None]] = {}

    async def req(self, method: str, path: str, **kw) -> dict | list:
        for attempt in range(6):
            r = await self.http.request(method, path, **kw)
            if r.status_code == 429:
                await asyncio.sleep(int(r.headers.get("Retry-After") or 0) or 5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json() if r.content else {}
        raise RuntimeError(f"{method} {path}: rate limited")

    async def all(self, path: str, **params) -> list[dict]:
        out, cursor = [], None
        while True:
            q = {"per_page": 100, **params, **({"cursor": cursor} if cursor else {})}
            d = await self.req("GET", path, params=q)
            if isinstance(d, list):
                return d
            out += d.get("results", [])
            if not d.get("next_page_results"):
                return out
            cursor = d["next_cursor"]

    # ---- reads
    async def projects(self) -> list[dict]:
        return await self.all("/projects/")

    async def states(self, pid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/states/")

    async def items(self, pid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/work-items/")

    async def modules(self, pid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/modules/")

    async def module_items(self, pid: str, mid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/modules/{mid}/module-issues/")

    async def labels(self, pid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/labels/")

    async def cycles(self, pid: str) -> list[dict]:
        return await self.all(f"/projects/{pid}/cycles/")

    # ---- writes
    async def create_cycle(self, pid: str, name: str, start: str, end: str) -> dict:
        return await self.req("POST", f"/projects/{pid}/cycles/", json={
            "name": name, "start_date": start, "end_date": end, "project_id": pid})

    async def transfer(self, pid: str, from_cycle: str, to_cycle: str) -> None:
        await self.req("POST", f"/projects/{pid}/cycles/{from_cycle}/transfer-issues/",
                       json={"new_cycle_id": to_cycle})

    async def rename_state(self, pid: str, sid: str, name: str) -> None:
        await self.req("PATCH", f"/projects/{pid}/states/{sid}/", json={"name": name})

    # ---- who is this browser? (Plane session cookie -> user), cached a minute
    async def session_user(self, cookie: str) -> dict | None:
        if not cookie:
            return None
        hit = self._sessions.get(cookie)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        try:
            r = await self.session_http.get("/api/users/me/", headers={"Cookie": cookie})
            user = r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            user = None
        self._sessions[cookie] = (time.monotonic() + 60, user)
        if len(self._sessions) > 500:
            self._sessions.clear()
        return user
