import { useSyncExternalStore } from "react";
import { getSoundState, subscribeSound } from "./engine";

const SERVER = { fx: true, music: false };

export function useSoundState() {
  return useSyncExternalStore(subscribeSound, getSoundState, () => SERVER);
}
