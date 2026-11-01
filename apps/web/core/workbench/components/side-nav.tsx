/**
 * Workbench's screens at the top of the sidebar, in the Rust launcher style: HOME, BLUEPRINTS,
 * WIPE, SHOP and GUIDE. The research tree counts as BLUEPRINTS.
 */
import { observer } from "mobx-react";
import { Link } from "react-router";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@plane/utils";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { WB_TABS } from "../pages/shell";

export const WbSideNav = observer(function WbSideNav() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname() ?? "";
  const { toggleSidebar, isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();
  const slug = workspaceSlug?.toString() ?? "";
  const base = `/${slug}/`;
  const isOn = (key: string, path: string) =>
    key === "home"
      ? pathname === base || pathname === `/${slug}`
      : pathname.startsWith(base + path) || (key === "blueprints" && pathname.startsWith(`${base}wb/tree/`));

  return (
    <nav className="wb-sidenav" aria-label="Workbench">
      {WB_TABS.map(({ key, label, path, Icon }) => (
        <Link
          key={key}
          to={base + path}
          className={cn("wb-sidenav__item", isOn(key, path) && "wb-sidenav__item--on")}
          aria-current={isOn(key, path) ? "page" : undefined}
          onClick={() => {
            if (window.innerWidth < 768) toggleSidebar();
            if (isExtendedSidebarOpened) toggleExtendedSidebar(false);
          }}
        >
          <Icon className="size-4" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
});
