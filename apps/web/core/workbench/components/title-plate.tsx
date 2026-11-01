/**
 * The title worn at the top of the sidebar: a riveted, stamped metal plate with the title's
 * item, like a trophy bolted to the workbench. On the first open of each day it is stamped on
 * (a thud, sparks); after that it only catches the light now and then. A newly earned title
 * arrives as a TITLE EARNED notice.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "react-router";
import { cn } from "@plane/utils";
import type { TEarned, TTitle } from "../lib/api";
import { useWbState } from "../lib/api";
import { play } from "../sound/engine";
import { pushNotice } from "./notices";
import { RustItem } from "./rust-icon";

const STAMPED = "wb:title:stamped"; // "<title id>|<local date>" of the last stamp
const EARNED = "wb:title:earned"; // earned titles already announced
const SPARKS = 8;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* the stamp or notice comes again next time */
  }
}

const today = () => new Date().toLocaleDateString("en-CA");

/** The plate itself, also shown as a preview in the Shop. */
export function PlateFace({
  title,
  className,
}: {
  title: Pick<TTitle, "name" | "item" | "tone" | "motto">;
  className?: string;
}) {
  return (
    <span className={cn("wb-title", `wb-title--${title.tone}`, className)}>
      <span className="wb-title__ic">
        <RustItem item={title.item} size={34} />
      </span>
      <span className="wb-title__txt">
        <small>Title</small>
        <b>{title.name}</b>
        <em>{title.motto}</em>
      </span>
    </span>
  );
}

function useEarnedNotices(earned: TEarned[] | undefined, slug: string | undefined) {
  const key = earned?.map((t) => t.id).join(",");
  useEffect(() => {
    if (!earned || !slug || !key) return;
    const seen = new Set((read(EARNED) ?? "").split(","));
    write(EARNED, key);
    for (const t of earned.filter((x) => !seen.has(x.id)))
      pushNotice({ kind: "learned", title: "Title earned", name: t.name, item: t.item, href: `/${slug}/wb/shop` });
    // runs when the set of earned titles changes, not on every refresh of the same list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug]);
}

export function TitlePlate() {
  const { workspaceSlug } = useParams();
  const { data } = useWbState();
  const title = data?.title;
  const [fresh, setFresh] = useState(false);
  const slug = workspaceSlug?.toString();
  useEarnedNotices(data?.titles_earned, slug);

  const id = title?.id;

  useEffect(() => {
    if (!id) return;
    const mark = `${id}|${today()}`;
    if (read(STAMPED) === mark) return;
    setFresh(true);
    play("box");
    const t = setTimeout(() => {
      setFresh(false);
      write(STAMPED, mark);
    }, 2400);
    return () => clearTimeout(t);
  }, [id]);

  if (!title || !slug) return null;
  return (
    <Link
      to={`/${slug}/wb/shop`}
      className={cn("wb-title-link", fresh && "wb-title-link--fresh")}
      title={`Title: ${title.name} · ${title.motto}. Change it in the Shop.`}
    >
      <PlateFace title={title} className={cn(fresh && "wb-title--fresh")} />
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
