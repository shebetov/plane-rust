/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

type TSidebarNavItem = {
  className?: string;
  isActive?: boolean;
  children?: React.ReactNode;
};

export function SidebarNavItem(props: TSidebarNavItem) {
  const { className, isActive, children } = props;
  return (
    <div
      className={cn(
        // Workbench: wb-sideitem gives every sidebar entry the Rust tab look (workbench.css)
        "wb-sideitem group relative flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md px-2 py-1 outline-none",
        isActive && "wb-sideitem--on",
        {
          "!bg-layer-transparent-active text-primary": isActive,
          "text-secondary hover:bg-layer-transparent-hover active:bg-layer-transparent-active": !isActive,
        },
        className
      )}
    >
      {children}
    </div>
  );
}
