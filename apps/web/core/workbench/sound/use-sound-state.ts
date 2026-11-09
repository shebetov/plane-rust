import { useSyncExternalStore } from "react";
import { getSoundState, subscribeSound } from "./engine";

const SERVER = { fx: true, music: false, bg: false, mobile: false };

export function useSoundState() {
  return useSyncExternalStore(subscribeSound, getSoundState, () => SERVER);
}
