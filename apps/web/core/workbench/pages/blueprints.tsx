/**
 * BLUEPRINTS in the sidebar: straight to a research tree, the last one opened, else the first
 * Blueprint with work left. The tree's own list switches between Blueprints.
 */
import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useParams } from "next/navigation";
import { useWbHome } from "../lib/api";
import { readPref } from "./tech-tree";
import { WbPage } from "./shell";

export function BlueprintsEntry() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data } = useWbHome();
  const navigate = useNavigate();
  const list = data?.blueprints;
  const last = readPref("wb:tt:last");
  const target = list?.find((b) => b.id === last) ?? list?.find((b) => b.open > 0) ?? list?.[0];

  useEffect(() => {
    if (target) void navigate(`/${slug}/wb/tree/${target.id}`, { replace: true });
  }, [target, slug, navigate]);

  return (
    <WbPage active="blueprints" title="Research tree">
      {list && !list.length ? (
        <p className="wb-muted">
          No Blueprints yet. <Link to={`/${slug}/projects/`}>Add one</Link>.
        </p>
      ) : (
        <p className="wb-muted">Opening the research tree…</p>
      )}
    </WbPage>
  );
}
