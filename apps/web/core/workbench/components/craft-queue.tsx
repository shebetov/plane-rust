/**
 * Rust's craft queue, bottom right on every screen: one slot per Item in Crafting (the
 * Blueprint's icon, its key, and a health bar that drains as the Item decays).
 */
import { useState } from "react";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { useWbQueue } from "../lib/api";
import { RustLogo } from "./rust-icon";

const SHOW = 5;
const HP = [100, 65, 35, 12];

export function CraftQueue() {
  const { workspaceSlug } = useParams();
  const { data } = useWbQueue();
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [];
  if (!items.length || !workspaceSlug) return null;
  const visible = open ? items : items.slice(0, SHOW);
  return (
    <div className={cn("wb-queue", open && "wb-queue--open")} aria-label="Craft queue">
      {/* on phones the header is a pill that opens the queue */}
      <button type="button" className="wb-queue__hd" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Crafting</span>
        <b>{items.length}</b>
      </button>
      <div className="wb-queue__slots">
        {visible.map((it) => (
          <Tooltip
            key={it.id}
            tooltipContent={`${it.identifier}-${it.seq} · ${it.name}${it.decay ? " · decaying" : ""}`}
            position="top"
          >
            <a
              href={`/${workspaceSlug.toString()}/browse/${it.identifier}-${it.seq}/`}
              className={cn("wb-slot", it.decay > 0 && `wb-slot--decay${it.decay}`)}
            >
              <RustLogo logo={it.logo} size={30} />
              <span className="wb-slot__key">{it.seq}</span>
              <span className="wb-slot__hp">
                <i style={{ width: `${HP[it.decay]}%` }} />
              </span>
            </a>
          </Tooltip>
        ))}
        {items.length > SHOW && (
          <button type="button" className="wb-slot wb-slot--more" onClick={() => setOpen(!open)}>
            {open ? "−" : `+${items.length - SHOW}`}
          </button>
        )}
      </div>
    </div>
  );
}
