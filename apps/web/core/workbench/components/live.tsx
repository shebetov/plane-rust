/**
 * The live game layer, mounted once inside the signed-in workspace:
 *  - on load: "crafted while you were away" notices (companion /visit)
 *  - live: the companion's event stream (from Plane webhooks) -> notices + sounds, and
 *    the Workbench data (scrap, queue, home) refreshes
 */
import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { mutate } from "swr";
import type { TCrafted, TLogo } from "../lib/api";
import { useWbState, wb } from "../lib/api";
import { NoticeStack, pushNotice } from "./notices";
import { CraftQueue } from "./craft-queue";

type TEvent = {
  type: "crafted" | "scrapped" | "crafting" | "moved";
  item: { id: string; name: string; seq: number };
  project: { id: string; name: string; identifier: string; logo: TLogo };
  scrap: number;
  learned?: boolean;
};

function refreshAll() {
  void mutate((key) => typeof key === "string" && key.startsWith("wb:"));
}

export function WorkbenchLive() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { data: state, error } = useWbState();
  const visited = useRef(false);
  const ready = !!state && !error;

  // crafted while you were away
  useEffect(() => {
    if (!ready || visited.current) return;
    visited.current = true;
    void wb
      .post<{ since: string | null; crafted: TCrafted[] }>("visit")
      .then((r) => {
        // oldest first, so the newest ends up on top
        const list = r.crafted.slice(0, 5);
        for (let i = list.length - 1; i >= 0; i--) {
          const c = list[i];
          pushNotice({
            kind: "crafted",
            title: "Crafted while away",
            name: c.name,
            logo: c.logo,
            scrap: c.scrap,
            href: slug ? `/${slug}/projects/${c.project}/issues/` : undefined,
          });
        }
        return null;
      })
      .catch(() => null);
  }, [ready, slug]);

  // live events
  useEffect(() => {
    if (!ready || typeof EventSource === "undefined") return;
    const es = new EventSource("/wb/api/events");
    es.addEventListener("message", (m) => {
      let ev: TEvent;
      try {
        ev = JSON.parse(m.data) as TEvent;
      } catch {
        return;
      }
      const href = slug ? `/${slug}/projects/${ev.project.id}/issues/` : undefined;
      if (ev.type === "crafted") {
        pushNotice({
          kind: "crafted",
          title: "Item crafted",
          name: ev.item.name,
          logo: ev.project.logo,
          scrap: ev.scrap,
          href,
        });
        if (ev.learned)
          pushNotice({
            kind: "learned",
            title: "Blueprint learned",
            name: ev.project.name,
            logo: ev.project.logo,
            href,
          });
      } else if (ev.type === "scrapped") {
        pushNotice({ kind: "scrapped", title: "Item scrapped", name: ev.item.name, logo: ev.project.logo, href });
      }
      refreshAll();
    });
    return () => es.close();
  }, [ready, slug]);

  if (!ready) return null;
  return (
    <>
      <NoticeStack frame={state.equipped.frame?.replace("frame-", "")} />
      <CraftQueue />
    </>
  );
}
