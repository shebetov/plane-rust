/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

// Workbench screens, merged into the workspace layout (see helper.ts mergeRoutes)
const WB = "./(all)/[workspaceSlug]/(projects)/wb";

export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        route(":workspaceSlug/wb/blueprints", `${WB}/blueprints.tsx`),
        route(":workspaceSlug/wb/tree/:projectId", `${WB}/tree.tsx`),
        route(":workspaceSlug/wb/shop", `${WB}/shop.tsx`),
        route(":workspaceSlug/wb/wipe", `${WB}/wipe.tsx`),
      ]),
    ]),
  ]),
];
