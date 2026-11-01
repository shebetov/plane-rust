/**
 * The title bought in the Shop, worn at the top of the sidebar: a riveted, stamped metal plate
 * with the title's item, like a trophy bolted to the workbench. A newly equipped title is
 * stamped on once (a thud, sparks); after that it only catches the light now and then.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { cn } from "@plane/utils";
import { useWbState } from "../lib/api";
import { play } from "../sound/engine";
import { RustItem } from "./rust-icon";

type TTitle = { name: string; item: string; tone: "steel" | "brass"; motto: string };

const TITLES: Record<string, TTitle> = {
  "badge-survivor": { name: "Wipe Survivor", item: "hazmatsuit", tone: "steel", motto: "Lived through the wipe" },
  "badge-builder": { name: "Master Builder", item: "building.planner", tone: "brass", motto: "Bases that never rust" },
};

const SEEN = "wb:title:seen";
const SPARKS = 8;

function seenTitle() {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    return null;
  }
}

export function TitlePlate() {
  const { workspaceSlug } = useParams();
  const { data } = useWbState();
  const id = data?.equipped.badge;
  const title = id ? TITLES[id] : undefined;
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!id || !title || seenTitle() === id) return;
    setFresh(true);
    play("box");
    try {
      localStorage.setItem(SEEN, id);
    } catch {
      /* stamped again next time */
    }
    const t = setTimeout(() => setFresh(false), 2400);
    return () => clearTimeout(t);
  }, [id, title]);

  if (!title || !workspaceSlug) return null;
  return (
    <Link
      to={`/${workspaceSlug.toString()}/wb/shop`}
      className={cn("wb-title", `wb-title--${title.tone}`, fresh && "wb-title--fresh")}
      title={`Title: ${title.name} · ${title.motto}. Change it in the Shop.`}
    >
      <span className="wb-title__ic">
        <RustItem item={title.item} size={34} />
      </span>
      <span className="wb-title__txt">
        <small>Title</small>
        <b>{title.name}</b>
        <em>{title.motto}</em>
      </span>
      {fresh && (
        <span className="wb-title__sparks" aria-hidden>
          {Array.from({ length: SPARKS }, (_, i) => (
            <i key={i} style={{ "--a": `${(360 / SPARKS) * i + 12}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
    </Link>
  );
}
