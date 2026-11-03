// banana-temple — the plaza + pad HARD COVER: broken wall stubs (coursed sandstone, chipped tops, moss), broken stela
// pillars (plinth + 2–3 carved drums with glyph panels, a tilted broken cap) and the two seated guardian statues on
// plinths. Every piece is drawn from the SAME lists the colliders come from (shared TEMPLE.walls / columns / statues in
// jungle-layout.ts, incl. the generated outer ring), in the temple's local frame, so what you see is what stops you.
import * as THREE from "three";
import type { WorldCtx } from "../../../engine/engine";
import { TEMPLE, mulberry } from "../../../../../shared/pois/jungle-layout";
import { OUTSKIRTS } from "../../../../../shared/pois/banana-temple";
import { block, merge, staticMesh, boxUVs, type Geo } from "../_kit/jungle-geo";
import { hero } from "../_kit/jungle-hero";
import { heroStoneMaterial, pbr } from "../_kit/jungle-mat";
import type { TempleMats } from "./temple";

const TONES = ["#e2dbc8", "#d6ceb9", "#cbc3ad", "#ddd3bd"];

export async function buildCover(ctx: WorldCtx, mats: TempleMats, root: THREE.Group) {
  const T = TEMPLE, rnd = mulberry(5150);
  const tone = () => TONES[Math.floor(rnd() * TONES.length)];
  const buckets = new Map<string, { stone: Geo[]; glyph: Geo[] }>();
  const bucket = (x: number, z: number) => { const r = Math.hypot(x, z), k = r < 45 ? "c" : `${r < 85 ? "i" : "o"}${Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 8}`; let b = buckets.get(k); if (!b) buckets.set(k, (b = { stone: [], glyph: [] })); return b; };
  // wall stubs: courses of 0.5–0.62 m blocks, staggered joints, the top course chipped (≤ 0.15 m, the collider top stays
  // within the parity tolerance), 0.9 m thick like the collider. No fallen-stone chips at the foot:
  // they floated 0.28 m over the grass and read as faceted low-poly gems next to the chunky blocks
  const wallStub = (x: number, z: number, len: number, h: number, yaw: number, y0 = 0) => {
    const { stone } = bucket(x, z);
    const c = Math.cos(yaw), s = Math.sin(yaw), ux = c, uz = -s;   // local +X of the wall in the temple frame
    const courses = Math.max(2, Math.round(h / 0.56)), ch = h / courses;
    // (parity) a dark rubble core fills the joints + the chipped top, so no ray slips between two courses
    stone.push(block(len - 0.1, h - 0.03, 0.78, x, y0 + (h - 0.03) / 2, z, yaw, { bevel: 0.02, uvScale: 4.2, tint: "#8f877a", var: 0.05 }));
    for (let k = 0; k < courses; k++) {
      let u = -len / 2; const first = k % 2 ? 0.35 + rnd() * 0.3 : 0;
      while (u < len / 2 - 0.05) {
        const bl = Math.min(len / 2 - u, first && u === -len / 2 ? first : 0.9 + rnd() * 0.7), top = k === courses - 1, bh = ch - (top ? rnd() * 0.1 : 0.0), mid = u + bl / 2;
        stone.push(block(bl + (u === -len / 2 || u + bl >= len / 2 - 0.001 ? 0.03 : -0.025), bh - 0.012, 0.93 - (rnd() < 0.3 ? 0.04 : 0), x + ux * mid, y0 + k * ch + bh / 2, z + uz * mid, yaw + (rnd() - 0.5) * 0.02, { bevel: 0.07, uvScale: 4.2, tint: tone(), var: 0.07 }));
        u += bl;
      }
    }
  };
  for (const [x, z, len, h, yaw] of T.walls) wallStub(x, z, len, h, yaw);
  // broken stela pillars: plinth, carved drums (glyph panels on two faces), a tilted broken cap
  const stela = (x: number, z: number, r: number, h: number, y0 = 0) => {
    const { stone, glyph } = bucket(x, z);
    const w = r * 1.75 + 0.02, yaw = 0;   // (parity: square to its collider, never rotated off it)
    stone.push(block(r * 2.4, 0.4, r * 2.4, x, y0 + 0.2, z, yaw, { bevel: 0.08, uvScale: 4.2, tint: "#cfc7b2", var: 0.05 }));
    const nD = h > 2.6 ? 3 : 2, body = h - 0.4 - 0.32, dh = body / nD;
    for (let k = 0; k < nD; k++) {
      const yb = y0 + 0.4 + k * dh, rot = yaw;
      stone.push(block(w, dh - 0.02, w, x, yb + dh / 2, z, rot + (k % 2 ? 0.0 : 0.0), { bevel: 0.06, uvScale: 4.2, tint: tone(), var: 0.06 }));
      if (k === Math.min(1, nD - 1)) for (const f of [1, -1]) { const g = block(w * 0.72, dh * 0.72, 0.05, x - Math.sin(rot) * 0 + Math.sin(rot) * f * (w / 2 + 0.005), yb + dh / 2, z + Math.cos(rot) * f * (w / 2 + 0.005), rot, { bevel: 0.015, uvScale: 1 }); boxUVs(g, 1.1); glyph.push(g); }
    }
    // the broken top: a full-width cap slab, barely tilted (its top = the collider top), a dark core inside the drums
    stone.push(block(w + 0.02, 0.32, w + 0.02, x, y0 + h - 0.16, z, yaw, { bevel: 0.06, uvScale: 4.2, tint: tone(), rz: (rnd() - 0.5) * 0.02, rx: (rnd() - 0.5) * 0.02 }));
    stone.push(block(w - 0.14, h - 0.45, w - 0.14, x, y0 + 0.4 + (h - 0.45) / 2, z, yaw, { bevel: 0.02, uvScale: 4.2, tint: "#8f877a" }));
  };
  for (const [x, z, r, h] of T.columns) stela(x, z, r, h);
  // the outskirts beyond the pad, seated on the terrain (baked: shared OUTSKIRTS = their colliders)
  await ctx.yield();
  for (let i = 0; i < OUTSKIRTS.length; i++) { const [x, z, k, len, , yaw, y0, y1] = OUTSKIRTS[i]; if (k === 0) wallStub(x, z, len, y1 - y0, yaw, y0); else stela(x, z, len, y1 - y0, y0); if (i % 50 === 49) await ctx.yield(); }
  await ctx.yield();
  // guardian statues: carved plinth + the seated gorilla guardian (same GLB as the vault's), sunlit sandstone with moss
  for (const [x, z, yaw] of T.statues) bucket(x, z).stone.push(block(2.8, 1.2, 2.8, x, 0.6, z, yaw, { bevel: 0.1, uvScale: 4.2, tint: "#d6ceb9" }));
  // one mesh set per spatial chunk (8 sectors × 2 rings + the plaza): frustum culling works on the 136 m ring
  for (const b of buckets.values()) { await ctx.yield(); root.add(...[staticMesh(merge(b.stone), mats.stone, "plaza-cover"), staticMesh(merge(b.glyph), mats.frieze, "plaza-cover-glyphs", false)].filter((m): m is THREE.Mesh => !!m)); }
  let gm: THREE.MeshStandardMaterial | undefined;
  const carved = (bm: THREE.MeshStandardMaterial) => (gm ??= (() => { const m = heroStoneMaterial(pbr(ctx, "boulder"), bm.map, { scale: 1.8, bakeMix: 0.95, bakeGain: 2.2, moss: 0.55, mossCover: 0.45, mossColor: "#79a836", variation: 0.25, lift: 0.3, liftTop: "#c6d4e4", liftBottom: "#b09a82", detail: 0.7 }, pbr(ctx, "moss")); m.color.setRGB(0.95, 0.88, 0.76); return m; })());
  for (const [x, z, yaw] of T.statues) root.add(await hero(ctx, "guardian", x, 1.2, z, { height: 2.6, yaw, name: "plaza-guardian", material: carved }));
}
