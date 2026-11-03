/** Device-local maxima; no match counts, rewards or cross-size placement ranking. */
export type BestContext = { mode: "solo" | "trios"; opponent: "easy" | "standard" | "hard" | "friends" };
export type BestSample = { kills: number; damage: number; survivedS: number; placement: number; totalSquads: number };
type RecordRow = { kills: number; damage: number; survivedS: number; placements: Record<string, number> };
export type BestRecap = { context: string; status: string; headline: string; target: string; records: string[] };
export const BESTS_KEY = "kr-personal-bests-v1";
const empty = (): RecordRow => ({ kills: 0, damage: 0, survivedS: 0, placements: {} });
const valid = (n: unknown, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n);
const time = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const groups = ["solo", "trios"].flatMap(m => ["easy", "standard", "hard", "friends"].map(o => `${m}:${o}`));
export function createPersonalBests(storage: () => Pick<Storage, "getItem" | "setItem"> = () => localStorage) {
  const records: Record<string, RecordRow> = {};
  const sessions = new WeakMap<object, { key: string; before: RecordRow; existed: boolean }>();
  let readable = true, lastSaved: string | null = null;
  try {
    const raw = storage().getItem(BESTS_KEY);
    if (raw && raw.length <= 32000) {
      lastSaved = raw;
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.records && typeof parsed.records === "object") for (const key of groups) {
        const row = parsed.records[key];
        if (!row || !valid(row.kills, 10000) || !valid(row.damage, 10000000) || !valid(row.survivedS, 86400)) continue;
        const clean = empty(); clean.kills = row.kills; clean.damage = row.damage; clean.survivedS = row.survivedS;
        for (let n = 1; n <= 50; n++) if (valid(row.placements?.[n], n) && row.placements[n] >= 1) clean.placements[n] = row.placements[n];
        records[key] = clean;
      }
    }
  } catch { readable = false; }
  return {
    recap(context: BestContext, sample: BestSample, session: object): BestRecap {
      const key = `${context.mode}:${context.opponent}`;
      const label = `${context.mode === "solo" ? "Solo" : "Trios"} · ${context.opponent === "friends" ? "Online friends" : `Practice · ${context.opponent[0].toUpperCase()}${context.opponent.slice(1)}`}`;
      if (!groups.includes(key) || !valid(sample.kills, 10000) || !valid(sample.damage, 10000000) || !valid(sample.survivedS, 86400) || !valid(sample.totalSquads, 50) || sample.totalSquads < 1 || !valid(sample.placement, sample.totalSquads) || sample.placement < 1) {
        return { context: label, status: "Result unavailable · records unchanged", headline: "Your next drop awaits", target: "Complete a match to set a personal best.", records: [] };
      }
      let baseline = sessions.get(session);
      if (!baseline || baseline.key !== key) {
        baseline = { key, before: structuredClone(records[key] ?? empty()), existed: !!records[key] }; sessions.set(session, baseline);
      }
      const before = baseline.before, best = records[key] ?? empty();
      const oldPlacement = before.placements[sample.totalSquads];
      const improved = [sample.kills > before.kills ? "kills" : "", sample.damage > before.damage ? "damage" : "", sample.survivedS > before.survivedS ? "time in match" : "", oldPlacement !== undefined && sample.placement < oldPlacement ? "placement" : ""].filter(Boolean);
      best.kills = Math.max(best.kills, sample.kills); best.damage = Math.max(best.damage, sample.damage); best.survivedS = Math.max(best.survivedS, sample.survivedS);
      best.placements[sample.totalSquads] = Math.min(best.placements[sample.totalSquads] ?? sample.placement, sample.placement);
      records[key] = best;
      let saved = readable;
      const serialized = JSON.stringify({ version: 1, records });
      try {
        if (lastSaved !== serialized || !readable) storage().setItem(BESTS_KEY, serialized);
        lastSaved = serialized; saved = true; readable = true;
      } catch { saved = false; }
      const placement = best.placements[sample.totalSquads];
      return { context: label, status: saved ? "Personal bests · saved on this device" : "Personal bests · this session only (storage unavailable)",
        headline: !baseline.existed ? "First personal bests for this mode" : improved.length ? `New best: ${improved.join(" + ")}` : "Your personal bests stand",
        target: placement > 1 ? `Next target: #${placement - 1} of ${sample.totalSquads} ${context.mode === "solo" ? "players" : "squads"}. Placement records compare equal lobby sizes.` : `Next target: ${best.kills + 1} kills. You already hold #1 for this lobby size.`,
        records: [`${best.kills} kills`, `${best.damage} damage`, `${time(best.survivedS)} in match`, `#${placement} of ${sample.totalSquads}`] };
    },
  };
}
