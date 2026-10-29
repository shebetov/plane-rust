# workbench-server

Workbench's companion service: the Rust game layer next to Plane. It never touches Plane's
database; it reads Plane through its REST API and keeps its own state in SQLite:

- **Scrap ledger:** every crafted Item earns scrap by building grade. The ledger is kept even
  after Plane archives the Item.
- **Tool Cupboard:** each Blueprint is protected for 7 days after its last craft. Scrap buys
  2 more days.
- **Server wipes:** every second Thursday the same Wipe (cycle) is created in every active
  Blueprint, and unfinished Items roll over.
- **Tech tree data** for each Blueprint: Kits as steps, the next step, decay.
- **Live notices:** Plane webhooks become `crafted` / `scrapped` events, pushed to browsers
  over SSE.
- **Shop (draft):** cosmetic unlocks paid for with scrap.

Browser endpoints (`/wb/api/*`) authenticate with the Plane session cookie. `/wb/webhook`
checks Plane's HMAC signature.

```
uv run --group dev pytest -q
PLANE_URL=http://localhost:8080 PLANE_API_KEY=… WB_DB=./wb.db uv run uvicorn workbench_server.app:create_app --factory
```
