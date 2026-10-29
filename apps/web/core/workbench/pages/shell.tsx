/**
 * Shared frame for Workbench's own screens: Plane's app header with Rust launcher tabs
 * (MAIN MENU / BLUEPRINTS / WIPE / SHOP), then a scrolling page.
 */
import { Box, Hammer, Home, Store } from "lucide-react";
import { Link } from "react-router";
import { useParams } from "next/navigation";
import { cn } from "@plane/utils";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";

export type TWbTab = "home" | "blueprints" | "wipe" | "shop";

const TABS: Array<{ key: TWbTab; label: string; path: string; Icon: typeof Home }> = [
  { key: "home", label: "Main menu", path: "", Icon: Home },
  { key: "blueprints", label: "Blueprints", path: "wb/blueprints", Icon: Hammer },
  { key: "wipe", label: "Wipe", path: "wb/wipe", Icon: Box },
  { key: "shop", label: "Shop", path: "wb/shop", Icon: Store },
];

export function WbTabs({ active }: { active?: TWbTab }) {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  return (
    <nav className="wb-tabs" aria-label="Workbench">
      {TABS.map(({ key, label, path, Icon }) => (
        <Link key={key} to={`/${slug}/${path}`} className={cn("wb-tab", active === key && "wb-tab--on")}>
          <Icon className="size-4" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function WbPage({
  active,
  title,
  children,
  bare,
}: {
  active?: TWbTab;
  title: string;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <>
      <AppHeader header={<WbTabs active={active} />} />
      <ContentWrapper>
        <PageHead title={`${title} · Workbench`} />
        <div className={cn("wb-page", bare && "wb-page--bare")}>{children}</div>
      </ContentWrapper>
    </>
  );
}

/** A Rust panel: dark plate with a stencil caption. */
export function Panel({
  title,
  right,
  className,
  children,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("wb-panel", className)}>
      {title && (
        <header className="wb-panel__hd">
          <span>{title}</span>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function ago(iso?: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}
