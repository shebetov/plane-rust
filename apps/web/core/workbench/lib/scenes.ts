/**
 * Main-menu backgrounds. The pictures live in the private theme (theme/menu): the launcher
 * art plus `bg/<slug>.jpg` and `thumb/<slug>.jpg` for every banner. A banner offer's id is
 * `banner-<slug>`. Without the theme the scene gradient underneath shows instead.
 */
const ROOT = "/workbench/theme/menu";

/** The default scene crossfades through these: the launcher art, then five Rust bases. */
export const DEFAULT_SCENES = ["main-1", "main-2", "wood-wall", "wood-barn", "brick", "brutalist", "containers"];

/** Scenes with a portrait picture, used on tall (phone) screens. */
const TALL = new Set(["brutalist", "jungle-house"]);

export const sceneUrl = (slug: string) => (slug.startsWith("main-") ? `${ROOT}/${slug}.jpg` : `${ROOT}/bg/${slug}.jpg`);
export const sceneTallUrl = (slug: string) => (TALL.has(slug) ? `${ROOT}/bg/${slug}-tall.jpg` : null);
export const sceneThumb = (slug: string) => `${ROOT}/thumb/${slug}.jpg`;
export const bannerSlug = (offerId: string) => offerId.replace(/^banner-/, "");
