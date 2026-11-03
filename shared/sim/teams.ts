// Team fill: how a match splits its seats into squads. Rules, for any player count:
//   - as many full squads as possible; a remainder of ONE is never left alone: one full squad gives a member up and the
//     two leftovers play as duos (49 → 15 × 3 + 2 × 2, never 16 × 3 + 1); a remainder of two is a duo (50 → 16 × 3 + 2)
//   - humans keep the squads their lobby gave them; bots first make every human solo a duo, then top every human squad
//     up to full, then form their own squads by the rule above; a single bot that would be left alone is not spawned
// Pure functions: the Match uses fillTeams; a lobby can use squadSizes / squadOfJoin for its own (human) squads.

/** squad sizes for `n` players in squads of `size`, no lone solo when avoidable (size 1 = everyone alone) */
export function squadSizes(n: number, size: number): number[] {
  n = Math.max(0, Math.floor(n));
  if (size <= 1) return new Array<number>(n).fill(1);
  let full = Math.floor(n / size), rem = n % size;
  const out: number[] = [];
  if (rem === 1 && full >= 1) { full--; rem += size; }            // a trio + 1 → 2 + 2 (a quad + 1 → 3 + 2)
  for (let i = 0; i < full; i++) out.push(size);
  if (rem > size) out.push(Math.ceil(rem / 2), Math.floor(rem / 2));
  else if (rem > 0) out.push(rem);
  return out;
}
/** a lobby's squad index for the i-th of `n` players (join order), by squadSizes: 49 in trios → 0..14 trios, 15/16 duos */
export function squadOfJoin(i: number, n: number, size: number): number {
  const s = squadSizes(n, size);
  for (let k = 0, acc = 0; k < s.length; k++) { acc += s[k]; if (i < acc) return k; }
  return Math.max(0, s.length - 1);
}

export interface TeamFill {
  /** seats actually used (ids 0..seats-1): the asked count, one less when a lone bot was left out */
  seats: number;
  /** the bots to create: seat id + squad */
  bots: Array<{ id: number; team: number }>;
}
/** fills `seats` seats around the humans (ids + lobby squads) with bots, in squads of `size` (see the rules above).
 *  Bot ids are the free ids from 0 up; never fewer seats than humans (more humans than seats: no bots at all). */
export function fillTeams(humans: ReadonlyArray<{ id: number; team: number }>, seats: number, size: number): TeamFill {
  let maxId = -1; for (const h of humans) maxId = Math.max(maxId, h.id);
  seats = Math.max(Math.floor(seats), humans.length, maxId + 1);
  const taken = new Set(humans.map((h) => h.id));
  const free: number[] = []; for (let id = 0; id < seats; id++) if (!taken.has(id)) free.push(id);
  let left = free.length;
  const count = new Map<number, number>(); for (const h of humans) count.set(h.team, (count.get(h.team) ?? 0) + 1);
  const order: number[] = [];                         // squads of the bots, in id order
  const humanTeams = [...count.keys()].sort((a, b) => a - b);
  if (size > 1) {
    // 1. no human alone: every human solo gets a bot partner first
    for (const t of humanTeams) if (left > 0 && count.get(t) === 1) { order.push(t); count.set(t, 2); left--; }
    // 2. every human squad topped up to full
    for (const t of humanTeams) while (left > 0 && count.get(t)! < size) { order.push(t); count.set(t, count.get(t)! + 1); left--; }
  }
  // 3. the rest: bot squads by squadSizes, on the lowest squad numbers no human uses
  const sizes = squadSizes(left, size);
  let dropped = 0;
  // one bot alone: leave it out (its seat is the last free id = the last seat, so the seats stay 0..seats-1 with no hole)
  if (size > 1 && sizes.length === 1 && sizes[0] === 1 && !taken.has(seats - 1)) { sizes.length = 0; dropped = 1; }
  let team = 0;
  for (const n of sizes) { while (count.has(team)) team++; count.set(team, n); for (let k = 0; k < n; k++) order.push(team); }
  const bots = order.map((t, i) => ({ id: free[i], team: t }));
  return { seats: seats - dropped, bots };
}
