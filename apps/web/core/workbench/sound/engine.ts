/**
 * Workbench sounds: short Rust UI effects plus optional Rust music, ported from the
 * Thesys map's sound.js. Files come from the private theme (/workbench/theme/sounds/);
 * a slot with no file is silent, so the public fork runs fine without them.
 *  - effects: on by default (localStorage wb:fx)
 *  - music:   off by default (localStorage wb:music); music-1.mp3, music-2.mp3, … shuffled
 * Browsers only start audio from a user gesture, so the first tap/keypress unlocks it.
 */

export type TSoundSlot =
  | "click"
  | "open"
  | "close"
  | "box"
  | "research-open"
  | "research-close"
  | "move"
  | "refresh"
  | "link";

const BASE = "/workbench/theme/sounds/";
const SLOTS: TSoundSlot[] = [
  "click",
  "open",
  "close",
  "box",
  "research-open",
  "research-close",
  "move",
  "refresh",
  "link",
];
const FX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.22;
const FADE_S = 2.5;

type TState = { fx: boolean; music: boolean };
const listeners = new Set<(s: TState) => void>();

function read(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === "on";
  } catch {
    return dflt;
  }
}
function write(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

let state: TState = { fx: true, music: false };
let ctx: AudioContext | null = null;
const buffers = new Map<TSoundSlot, Promise<AudioBuffer | null>>();
let tracks: string[] | null = null;
let order: string[] = [];
let music: HTMLAudioElement | null = null;
let musicGain: GainNode | null = null;
let musicFails = 0;
let lastPlay = 0;
let started = false;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state !== "running") ctx.resume().catch(() => undefined);
  return ctx;
}

/* iOS keeps Web Audio silent until a sound starts inside a gesture: a 1-sample buffer does it */
function unlock() {
  const c = audio();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

function load(slot: TSoundSlot): Promise<AudioBuffer | null> {
  let p = buffers.get(slot);
  if (!p) {
    p = fetch(`${BASE}${slot}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((b) => new Promise<AudioBuffer>((ok, no) => audio()!.decodeAudioData(b, ok, no)))
      .catch(() => null);
    buffers.set(slot, p);
  }
  return p;
}

export function play(slot: TSoundSlot) {
  if (!state.fx || !audio()) return;
  // two sounds in the same instant (a tap that also opens something): the click gives way
  const now = performance.now();
  if (slot === "click" && now - lastPlay < 60) return;
  lastPlay = now;
  void load(slot).then((buf) => {
    if (!buf || !state.fx || !ctx) return null;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = FX_VOLUME;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
    return null;
  });
}

/* ---------------- music ---------------- */

async function findTracks(): Promise<string[]> {
  if (tracks) return tracks;
  // probe music-1 … music-12 at once; the playlist stops at the first gap
  const urls = Array.from({ length: 12 }, (_, i) => `${BASE}music-${i + 1}.mp3`);
  const ok = await Promise.all(
    urls.map((u) =>
      fetch(u, { method: "HEAD" })
        .then((r) => r.ok)
        .catch(() => false)
    )
  );
  const gap = ok.indexOf(false);
  tracks = urls.slice(0, gap === -1 ? urls.length : gap);
  return tracks;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextTrack(): Promise<void> {
  if (!music || !tracks?.length) return Promise.resolve();
  if (!order.length) {
    order = shuffle(tracks.slice());
    const up = order[order.length - 1];
    if (order.length > 1 && music.src.endsWith(up)) order.unshift(order.pop()!);
  }
  music.src = order.pop()!;
  return music.play();
}

async function startMusic() {
  if (!state.music || document.hidden) return;
  const c = audio();
  const list = await findTracks();
  if (!c || !list.length || !state.music) return;
  if (!music) {
    music = new Audio();
    music.addEventListener("ended", () => void nextTrack().catch(() => undefined));
    music.addEventListener("playing", () => (musicFails = 0));
    music.addEventListener("error", () => {
      if (++musicFails < list.length) void nextTrack().catch(() => undefined);
    });
    // iOS ignores audio.volume: go through a gain node
    musicGain = c.createGain();
    c.createMediaElementSource(music).connect(musicGain);
    musicGain.connect(c.destination);
  }
  if (!music.paused) return;
  musicGain!.gain.cancelScheduledValues(c.currentTime);
  musicGain!.gain.setValueAtTime(0, c.currentTime);
  musicGain!.gain.linearRampToValueAtTime(MUSIC_VOLUME, c.currentTime + FADE_S);
  await (music.src ? music.play() : nextTrack()).catch(() => undefined);
}

function stopMusic() {
  music?.pause();
}

/* ---------------- switches ---------------- */

function emit() {
  for (const l of listeners) l(state);
}

export function getSoundState(): TState {
  return state;
}

export function subscribeSound(fn: (s: TState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setFx(on: boolean) {
  state = { ...state, fx: on };
  write("wb:fx", on);
  if (on) {
    unlock();
    play("click");
  }
  emit();
}

export function setMusic(on: boolean) {
  state = { ...state, music: on };
  write("wb:music", on);
  if (on) {
    unlock();
    void startMusic();
  } else stopMusic();
  emit();
}

/** Called once on the client: reads the switches and waits for the first gesture. */
export function startSoundEngine() {
  if (started || typeof window === "undefined") return;
  started = true;
  state = { fx: read("wb:fx", true), music: read("wb:music", false) };
  emit();
  const wake = () => {
    if (!state.fx && !state.music) return;
    unlock();
    if (state.fx) SLOTS.forEach((s) => void load(s));
    void startMusic();
  };
  for (const ev of ["pointerdown", "keydown", "touchend"]) document.addEventListener(ev, wake, { capture: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stopMusic() : void startMusic()));
}
