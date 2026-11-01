/**
 * Shared frame for Workbench's own screens: a header with the screen's name, then a
 * scrolling page. The screens themselves are listed in the sidebar.
 */
import { BookOpen, Box, Hammer, Home, Store } from "lucide-react";
import { cn } from "@plane/utils";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";

export type TWbTab = "home" | "blueprints" | "wipe" | "shop" | "guide";

/** Workbench's own screens, listed at the top of the sidebar (components/side-nav.tsx) */
export const WB_TABS: Array<{ key: TWbTab; label: string; path: string; Icon: typeof Home }> = [
  { key: "home", label: "Home", path: "", Icon: Home },
  { key: "blueprints", label: "Blueprints", path: "wb/blueprints", Icon: Hammer },
  { key: "wipe", label: "Wipe", path: "wb/wipe", Icon: Box },
  { key: "shop", label: "Shop", path: "wb/shop", Icon: Store },
  { key: "guide", label: "Guide", path: "wb/guide", Icon: BookOpen },
];

/** The page header: the screen's name as a stencil title (the sidebar is the only menu) */
function WbTitle({ active, title }: { active?: TWbTab; title: string }) {
  const tab = WB_TABS.find((t) => t.key === active);
  const Icon = tab?.Icon;
  return (
    <div className="wb-pagehd">
      {Icon && <Icon className="size-4" />}
      {tab && <span className={cn(tab.label !== title && "wb-pagehd__crumb")}>{tab.label}</span>}
      {(!tab || tab.label !== title) && (
        <>
          {tab && <i aria-hidden>/</i>}
          <b>{title}</b>
        </>
      )}
    </div>
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
      <AppHeader header={<WbTitle active={active} title={title} />} />
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
