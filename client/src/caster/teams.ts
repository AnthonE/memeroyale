// Team identity for the caster seat: every squad gets a colour and a callable name ("RED is pushing BLUE"). Trios has
// 17 squads (bots fill every match), so 17 colours whose NAMES are all different colour words — no five shades of green
// (the first palette had LIME / GREEN / MINT / JADE / TEAL; a LIME vs GREEN fight read as one squad) — and whose hues or
// values differ enough to tell apart as an outline on sand, grass, water and the dark storm. Solo (50 squads of one)
// cycles the same list: a caster talks about players there, and the colour only has to separate the kongs in one fight.

export interface TeamLook { name: string; color: string; /** a darker shade for panels / bars */ dark: string; /** 0xRRGGBB */ hex: number }

const LOOKS: Array<[string, string, string]> = [
  ["RED", "#ff4040", "#8c1f1f"], ["BLUE", "#3d8bff", "#173f73"], ["GOLD", "#ffd21f", "#7a6100"], ["GREEN", "#2fe36a", "#145e2a"],
  ["PINK", "#ff6fd1", "#7d2463"], ["VIOLET", "#a07bff", "#41297d"], ["ORANGE", "#ff8c2e", "#7f3e08"], ["TEAL", "#1fd6d6", "#0b5f5f"],
  ["WHITE", "#f4f4ee", "#5f6066"], ["LIME", "#d2ff1f", "#5a6e00"], ["MAROON", "#c4174a", "#5c0a22"], ["SKY", "#8fd8ff", "#235a78"],
  ["BROWN", "#b8743c", "#55331a"], ["NAVY", "#3a46d8", "#1a1f66"], ["MAGENTA", "#e81fff", "#5e0a6a"], ["PEACH", "#ffbf9a", "#7a4a33"],
  ["OLIVE", "#9da521", "#454a0c"],
];

const looks: TeamLook[] = LOOKS.map(([name, color, dark]) => ({ name, color, dark, hex: parseInt(color.slice(1), 16) }));

/** the look of squad `team` (0-based, as the server numbers them) */
export function teamLook(team: number): TeamLook { return looks[((team % looks.length) + looks.length) % looks.length]; }

/** "TEAM RED" in trios, the player's own name in solo (the caller passes it) */
export function teamLabel(team: number, mode: "solo" | "trios", soloName?: string): string {
  return mode === "solo" ? soloName ?? teamLook(team).name : `TEAM ${teamLook(team).name}`;
}
