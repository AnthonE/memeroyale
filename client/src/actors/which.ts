// Which player model draws, read once from the URL (client/src/flags.ts `kong`): Triple T (`tt`, Meme Royale's own,
// public/assets/actors/tt from tools/actors/triple-t-fit.py) by default; `?kong=v2` the Tripo kong, `?kong=v1` the
// Blender kong and `?kong=alt` v2 recoloured, kept for comparison. Its own module so the rig (kong-rig.ts) can read it
// without loading the asset code.
import { flag } from "../flags";

export type KongVer = "v1" | "v2" | "tt";
/** ?kong=alt: v2 with darker, cooler fur and a dark face (kong.ts ALT_GLSL / ALT_TUFT) */
export const KONG_ALT = flag("kong") === "alt";
export const KONG_DEFAULT: KongVer = "tt";
export const KONG_VER: KongVer = flag("kong") === "v1" ? "v1" : flag("kong") === "v2" || KONG_ALT ? "v2" : KONG_DEFAULT;
