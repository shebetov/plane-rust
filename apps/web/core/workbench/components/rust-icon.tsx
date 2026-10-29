import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
import type { TLogo } from "../lib/api";

/** A Blueprint/Kit logo (Rust item image for "rust:<item>" icons) at any size. */
export function RustLogo({ logo, size = 24 }: { logo?: TLogo; size?: number }) {
  return <Logo logo={(logo ?? undefined) as TLogoProps | undefined} size={size} />;
}

/** A Rust item image straight from the theme (decoration: scrap, cupboard, …). */
export function RustItem({ item, size = 24, className }: { item: string; size?: number; className?: string }) {
  return (
    <img
      src={`/workbench/theme/icons/${item}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
