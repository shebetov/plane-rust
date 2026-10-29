/**
 * Mounted once at the root: starts the Rust sound engine and the UI sounds.
 * Everything Workbench adds on top of Plane hangs off here.
 */
import { useEffect } from "react";
import { startSoundEngine } from "./sound/engine";
import { startUiSounds } from "./sound/ui-sounds";

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    startSoundEngine();
    return startUiSounds();
  }, []);
  return <>{children}</>;
}
