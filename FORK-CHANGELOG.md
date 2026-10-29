# Workbench fork changelog

**Workbench** is a Rust-game-styled fork of [Plane](https://github.com/makeplane/plane), on
branch `workbench`, based on the stable tag **v1.4.3**.

## Where the code lives

**Workbench's own code** is in new folders:
- `apps/web/core/workbench/` holds the theme CSS, sound engine, notices, craft queue, top-bar
  strip, the companion client, and the screens: main menu, server browser, tech tree, shop and
  wipe report.
- `apps/web/app/(all)/[workspaceSlug]/(projects)/wb/` holds thin route files.
- `apps/workbench-server/` is the companion service (scrap, Tool Cupboard, wipes, live events).
- `packages/i18n/src/core/workbench-glossary.ts` is the Rust glossary.
- `apps/web/public/workbench/fonts/` holds Roboto Condensed and Roboto Mono (Apache 2.0).

**No Rust assets are in this repo.** The private deploy repo injects `apps/web/public/workbench/theme/`
at build time, and that path is git-ignored.

## Plane files patched (re-check these on every upstream sync)

| File | Change |
|---|---|
| `apps/web/app/root.tsx` | forced dark theme, title and meta, `WorkbenchProvider` |
| `apps/web/styles/globals.css` | imports the Workbench CSS |
| `apps/web/app/routes/extended.ts` | Workbench routes |
| `apps/web/app/(all)/[workspaceSlug]/(projects)/page.tsx` | Home = main menu |
| `apps/web/core/components/navigation/top-navigation-root.tsx` | the Workbench strip instead of the GitHub star; classes for phones |
| `apps/web/core/components/sidebar/sidebar-wrapper.tsx` | WORKBENCH title, wipe and sound footer, explicit collapse on phones |
| `apps/web/core/components/sidebar/resizable-sidebar.tsx` | don't report the mount value (it re-opened the sidebar on phones) |
| `apps/web/core/components/issues/header.tsx` and `…/browse/[workItem]/work-item-header.tsx` | "Items" label |
| `packages/i18n/src/core/instance.ts` and `set-language.ts` | glossary in the loader; English only |
| `packages/constants/src/state.ts`, `issue/common.ts`, `metadata.ts` | crafting states, building grades, site name |
| `packages/constants/src/workspace.ts` | sidebar "Blueprints" opens the server browser |
| `packages/propel/src/emoji-icon-picker/logo.tsx` | `rust:<item>` logos |

## History
- **2026-10-29:**
  - forked at v1.4.3;
  - theme, glossary, sounds, companion service, live notices and craft queue;
  - main menu, server browser, tech tree, Tool Cupboard, shop and wipe report.
