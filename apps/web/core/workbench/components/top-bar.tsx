/**
 * Workbench's strip in Plane's top navigation (where Plane had "Star us on GitHub"):
 * the server wipe countdown and the sound switches.
 */
import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { currentWipe, leftText } from "../lib/wipe";
import { setFx, setMusic } from "../sound/engine";
import { useSoundState } from "../sound/use-sound-state";

function useNow(everyMs: number) {
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
  if (!now) return null;
  const wipe = currentWipe(now);
  const left = wipe.end.getTime() - now.getTime();
  const soon = left < 86_400_000;
  return (
    <Tooltip tooltipContent={`Wipe #${wipe.number} ends ${wipe.end.toDateString()}`} position="bottom">
      <div className={cn("wb-wipe", soon && "wb-wipe--soon", className)}>
        <span className="wb-wipe__k">Wipe in</span>
        <b className="wb-wipe__t">{leftText(left)}</b>
      </div>
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
      <WipeCountdown className="hidden sm:flex" />
      <SoundSwitches />
    </div>
  );
}
