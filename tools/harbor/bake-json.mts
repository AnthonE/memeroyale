// Bake Peel Harbor's furnished rooms (colliders + loot slots per room) and its LOOT_SPOTS into
// shared/pois/peel-harbor-baked.json, so neither the server nor the client's main thread furnishes 44 rooms / settles the
// loot at import. Run AFTER the rooms' seed picks (ROOM_PICK in shared/pois/peel-harbor.ts) are re-baked, and after any change of the rooms, the layout or the interiors kit
// (a stale bake is detected at import and falls back to live with a console warning).
//   npx tsx tools/harbor/bake-json.mts [--check]
import fs from "node:fs";
const FILE = new URL("../../shared/pois/peel-harbor-baked.json", import.meta.url);
const t0 = performance.now();
const H = await import("../../shared/pois/peel-harbor.ts");
const { bakeRooms, boxesSig } = await import("../../shared/pois/harbor-kit.ts");
const old = JSON.parse(fs.readFileSync(FILE, "utf8"));
const rooms = bakeRooms(H.INTERIOR_ROOMS);
// LOOT_SPOTS must be settled on the colliders WITH the baked rooms (the module was imported with the old bake)
const loot = H.lootSpotsLive();
const out = { rooms, loot: { sig: boxesSig(H.colliders), ...loot } };
if (process.argv.includes("--check")) { const same = JSON.stringify(old) === JSON.stringify(out); console.log(same ? "up to date" : "STALE"); process.exit(same ? 0 : 2); }
fs.writeFileSync(FILE, JSON.stringify(out));
console.log(`peel-harbor: ${rooms.rooms.length} rooms, ${loot.chests.length} chests + ${loot.floor.length} floor → ${FILE.pathname} (${(fs.statSync(FILE).size / 1024).toFixed(0)} KB, ${Math.round(performance.now() - t0)} ms)`);
