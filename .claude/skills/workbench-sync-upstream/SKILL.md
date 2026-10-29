---
name: workbench-sync-upstream
description: Move the Workbench fork (branch `workbench`) onto a new stable Plane release tag and redeploy. Use when asked to update or sync Workbench with upstream Plane.
---

# Sync Workbench with a new Plane release

Workbench tracks Plane's **stable tags** (`vX.Y.Z`), never `preview`. All Workbench code is in
new folders, so conflicts are limited to the few patched Plane files listed in
`FORK-CHANGELOG.md`.

1. Read `FORK-CHANGELOG.md`, which lists every Plane file Workbench touches.
2. Fetch the new tag: `git fetch upstream tag vX.Y.Z --no-tags`.
3. Rebase onto it, on a new branch:
   - `git switch -c sync/vX.Y.Z workbench`
   - `git rebase --onto vX.Y.Z <old-tag> sync/vX.Y.Z`
4. Resolve the conflicts. For each file in the changelog, keep Plane's new code and re-apply
   the Workbench change.
5. Check that the glossary still renames cleanly, with no broken ICU variables:
   - run `packages/i18n` type checks;
   - spot-check the new strings in `packages/i18n/src/locales/en`.
6. Build and verify:
   - `pnpm install`, then `pnpm turbo run build --filter=web`;
   - `cd apps/workbench-server && uv run --group dev pytest -q`;
   - run the local stack (`../plane-rust-deploy/dev/up.sh`) with the prod build served on :3000;
   - check desktop and phone with Playwright.
7. Fast-forward `workbench` to the sync branch and push. In `plane-rust-deploy`, set
   `PLANE_VERSION` (VM `.env`, `.env.example`, `dev/dev.env`) to the new tag. Run
   `gh workflow run build.yml -R shebetov/plane-rust-deploy`, then watch the build and deploy.
8. If the deploy breaks, roll back:
   - set `WEB_TAG` / `SERVER_TAG` to the previous short sha;
   - set `PLANE_VERSION` back to the previous tag;
   - redeploy.

   The database migrates forward only, so take `scripts/backup.sh` before step 7.
