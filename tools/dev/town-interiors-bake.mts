// Bake the furnished interiors of the town POIs (interiors-kit colliders + loot slots) into
// shared/pois/town-interiors.json, so the server and the client's main thread do not furnish ~600 rooms at import
// (~1.4 s). Re-run after ANY change of a town layout or of the interiors kit (shared/pois/interior-kit.ts) — a stale
// bake is detected at import (rooms key + 3 probe rooms) and falls back to live furnishing with a console warning.
//   npx tsx tools/dev/town-interiors-bake.mts [--check]
import fs from "node:fs";
import { bakeTownInteriors, roomsKey } from "../../shared/pois/town-kit";
const FILE = new URL("../../shared/pois/town-interiors.json", import.meta.url);
const POIS = ["mango-market", "stilt-town", "coconut-cove"];
const old = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, { key: string }>;
const out: Record<string, unknown> = {};
let stale = 0;
for (const id of POIS) {
  const mod = await import(`../../shared/pois/${id}.ts`);
  const rooms = mod.INTERIOR_ROOMS ?? [];
  if (!rooms.length) continue;
  const t0 = performance.now();
  const b = bakeTownInteriors(rooms);
  out[id] = b;
  if (old[id]?.key !== roomsKey(rooms)) stale++;
  console.log(`${id}: ${rooms.length} rooms, ${b.cols.length / 9} colliders, ${b.chests.length / 4} chest + ${b.floor.length / 3} floor slots, ${Math.round(performance.now() - t0)} ms`);
}
if (process.argv.includes("--check")) { console.log(stale ? `STALE (${stale})` : "up to date"); process.exit(stale ? 2 : 0); }
fs.writeFileSync(FILE, JSON.stringify(out));
console.log(`→ ${FILE.pathname} (${(fs.statSync(FILE).size / 1024).toFixed(0)} KB)`);
