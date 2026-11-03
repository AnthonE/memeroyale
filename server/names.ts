// Player display names.
//   cleanName: what every name the server shows goes through (printable ASCII the HUD font has, 14 chars, upper case).
//   reserved names: without them anyone could call themselves ADMIN / SYSTEM / HOST and sit in a streamed lobby looking
//   like staff. Reserved = the staff words below + KR_RESERVED_NAMES (comma list, e.g. "ALICE,BOB"), matched on a
//   de-leeted copy (0→O 1→I 3→E 4→A 5→S 6→G 7→T 8→B 9→G !→I) with runs of one letter collapsed, so ADM1N, A.D.M.I.N,
//   5Y5TEM, H-O-S-T are caught (homoglyphs from other scripts never get this far: cleanName drops every non-ASCII
//   letter). The long staff words are refused ANYWHERE in the name (THEADMIN, ADMIN BOB); the short ones (and the env
//   list) only as a whole word or as the whole name, so DEVIN, MODEL, HOSTILE, BOBBY stay legal. A reserved name a
//   player picks becomes FALLBACK_NAME; the admin's own renames are never refused.
export const FALLBACK_NAME = "KONG";
export const cleanName = (v: unknown) => String(v ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9 _.!?'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 14) || FALLBACK_NAME;

/** refused anywhere in the name */
const CONTAIN = ["ADMIN", "SYSTEM", "MODERATOR", "KONGBOT"];
/** refused as a whole word (a trailing S too: MODS, DEVS) or as the whole name */
const WORD = ["MOD", "DEV", "STAFF", "SERVER", "HOST", "OWNER"];

const LEET: Record<string, string> = { "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B", "9": "G", "!": "I" };
const collapse = (s: string) => s.replace(/([A-Z])\1+/g, "$1");
const deleet = (s: string) => s.replace(/[0-9!]/g, (ch) => LEET[ch] ?? ch);

/** a matcher for the staff words + `extra` (whole-word terms) */
export function reservedMatcher(extra: string[] = []): (name: string) => boolean {
  const contain = CONTAIN.map(collapse);
  // (not cleanName: its fallback would turn an empty entry — an unset env var — into a reserved "KONG")
  const word = [...WORD, ...extra.map((t) => deleet(String(t).normalize("NFKC").toUpperCase()).replace(/[^A-Z]/g, "")).filter((t) => t.length >= 2)].map(collapse);
  const wordHit = (w: string) => word.some((r) => w === r || w === r + "S");
  return (name: string) => {
    const up = cleanName(name);
    // "!" is a letter in "ADM!N" but punctuation in "MOD!": try both readings
    for (const variant of [up, up.replace(/!/g, "")]) {
      const d = deleet(variant);
      const squashed = collapse(d.replace(/[^A-Z]/g, ""));
      if (contain.some((r) => squashed.includes(r)) || wordHit(squashed)) return true;
      for (const w of d.split(/[^A-Z]+/)) if (w && wordHit(collapse(w))) return true;
    }
    return false;
  };
}
export const isReservedName = reservedMatcher(String(process.env.KR_RESERVED_NAMES || "").split(","));
/** a name a player picked: cleaned, and never a staff name */
export const playerName = (v: unknown) => { const n = cleanName(v); return isReservedName(n) ? FALLBACK_NAME : n; };
