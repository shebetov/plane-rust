/**
 * Workbench's strip in Plane's top navigation (where Plane had "Star us on GitHub"):
 * the server wipe countdown, scrap, the Tool Cupboard warning and the sound switches.
 * It also mounts the live layer (notices, craft queue).
 */
import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { useWbState } from "../lib/api";
import { currentWipe, leftText } from "../lib/wipe";
import { setFx, setMusic } from "../sound/engine";
import { useSoundState } from "../sound/use-sound-state";
import { WorkbenchLive } from "./live";
import { RustItem } from "./rust-icon";

export function useNow(everyMs: number) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

export function WipeCountdown({ className }: { className?: string }) {
  const now = useNow(30_000);
  const { data } = useWbState();
  if (!now) return null;
  const wipe = currentWipe(now);
  const number = data?.wipe.number ?? wipe.number;
  const left = wipe.end.getTime() - now.getTime();
  const soon = left < 86_400_000;
  return (
    <Tooltip tooltipContent={`Wipe #${number} · next wipe ${wipe.end.toDateString()}`} position="bottom">
      <div className={cn("wb-wipe", soon && "wb-wipe--soon", className)}>
        <span className="wb-wipe__k">Wipe in</span>
        <b className="wb-wipe__t">{leftText(left)}</b>
      </div>
    </Tooltip>
  );
}

function ScrapChip() {
  const { workspaceSlug } = useParams();
  const { data } = useWbState();
  if (!data || !workspaceSlug) return null;
  return (
    <Tooltip tooltipContent="Scrap: earned by crafting Items. Spend it in the shop." position="bottom">
      <a href={`/${workspaceSlug.toString()}/wb/shop`} className="wb-chip">
        <RustItem item="scrap" size={20} />
        <b>{data.scrap.balance.toLocaleString()}</b>
      </a>
    </Tooltip>
  );
}

function CupboardChip() {
  const { workspaceSlug } = useParams();
  const { data } = useWbState();
  if (!data || !workspaceSlug) return null;
  const states = Object.values(data.tc);
  const decaying = states.filter((s) => s.state === "decaying").length;
  const due = states.filter((s) => s.state === "due").length;
  if (!decaying && !due) return null;
  return (
    <Tooltip
      tooltipContent={
        decaying
          ? `${decaying} Blueprint${decaying > 1 ? "s" : ""} decaying: craft something to protect them`
          : "Upkeep due within a day"
      }
      position="bottom"
    >
      <a
        href={`/${workspaceSlug.toString()}/wb/blueprints`}
        className={cn("wb-chip", decaying ? "wb-chip--bad" : "wb-chip--warn")}
      >
        <RustItem item="cupboard.tool" size={20} />
        <b>{decaying || due}</b>
      </a>
    </Tooltip>
  );
}

export function SoundSwitches() {
  const { fx, music } = useSoundState();
  return (
    <div className="wb-switches">
      <Tooltip tooltipContent={fx ? "Sound effects on" : "Sound effects off"} position="bottom">
        <button
          type="button"
          className={cn("wb-ibtn", fx && "wb-ibtn--on")}
          aria-pressed={fx}
          aria-label="Sound effects"
          data-wb-silent
          onClick={() => setFx(!fx)}
        >
          {fx ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
      </Tooltip>
      <Tooltip tooltipContent={music ? "Music on" : "Music off"} position="bottom">
        <button
          type="button"
          className={cn("wb-ibtn", music && "wb-ibtn--on")}
          aria-pressed={music}
          aria-label="Music"
          onClick={() => setMusic(!music)}
        >
          <Music className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}

export function WorkbenchTopBar() {
  return (
    <div className="flex items-center gap-1.5">
      <WipeCountdown className="hidden md:flex" />
      <CupboardChip />
      <ScrapChip />
      <SoundSwitches />
      <WorkbenchLive />
    </div>
  );
}
