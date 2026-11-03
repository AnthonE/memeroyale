// THE MURK boardwalks: plank decks on log piles with rope rails, step flights down into the shallows, roof stairs and
// the rope bridge — all from shared/pois/the-murk.ts (the same decks / flights / bridge the colliders use).
import * as THREE from "three";
import { M, col, cylGeo, tubeGeo, catenary } from "../_kit/town-geo";
import type { TownBins } from "../_kit/town-materials";
import { addLashing } from "../_kit/town-lagoon";
import { type MDeck, type Flight, LAYOUT, bridgeY, WATER_Y, deckPiles, flightPosts } from "../../../../../shared/pois/the-murk";
import { soft, addPost, addRail, ROPE } from "./geo";

type V2 = [number, number];
const PLANK = () => soft("#b39676", 0.3, 1.0);

/** plank deck: board surface, fascia, bearers + stringers, log piles, rope rails */
export function addMDeck(main: TownBins, near: TownBins, k: MDeck, groundAt: (x: number, z: number) => number, rng: () => number) {
  const base = new THREE.Matrix4().makeRotationY(k.yaw).setPosition(k.x, 0, k.z);
  const L = (lx: number, ly: number, lz: number, yaw = 0, pitch = 0, roll = 0) => base.clone().multiply(M(lx, ly, lz, yaw, pitch, roll));
  const W = (lx: number, lz: number): V2 => { const c = Math.cos(k.yaw), s = Math.sin(k.yaw); return [k.x + lx * c + lz * s, k.z - lx * s + lz * c]; };
  // boards: runs of ~2–4 m (butt joints staggered), each a slightly different tone; planks run along local x
  // (across a walkway). A worn deck loses the odd board end and sags a hair.
  const seg = k.d / Math.max(1, Math.round(k.d / 2.6));
  for (let z0 = -k.d / 2; z0 < k.d / 2 - 1e-3; z0 += seg) {
    const tone = 0.86 + rng() * 0.26;
    const sag = k.worn ? -(rng() * 0.025) : 0;
    main.woodDark.box(k.w, 0.08, seg - 0.012, L(0, k.y - 0.04 + sag, z0 + seg / 2, 0, (rng() - 0.5) * 0.004, (rng() - 0.5) * 0.006), PLANK().multiplyScalar(tone), [rng() * 3, z0 * 0.37 + rng()]);
  }
  // fascia + stringers along the long sides, bearers across every ~1.6 m
  for (const s of [-1, 1]) {
    main.wood.box(0.07, 0.24, k.d + 0.04, L(s * (k.w / 2 + 0.035), k.y - 0.14, 0), soft("#8a7054", 0.5, 0.9));
    near.wood.box(0.12, 0.2, k.d, L(s * (k.w / 2 - 0.35), k.y - 0.2, 0), col("#5a4634"));
  }
  const nb = Math.max(2, Math.round(k.d / 1.6));
  for (let i = 0; i <= nb; i++) main.wood.box(k.w + 0.3, 0.16, 0.14, L(0, k.y - 0.3, -k.d / 2 + 0.1 + (k.d - 0.2) * i / nb), col("#5e4a36"));
  // piles at the bearer ends (every other bearer on long walks), leaning a touch, lashed
  // piles: exactly the shared layout's (their colliders come from the same list)
  for (const [x, z, r] of deckPiles(k)) addPost(main, x, z, k.y - 0.22, Math.min(groundAt(x, z), WATER_Y) - 0.8, r * (0.9 + rng() * 0.15), rng, true);
  // rails
  const r = k.rails ?? {};
  const side = (spans: boolean | V2[] | undefined, key: "nx" | "px" | "nz" | "pz") => {
    if (!spans) return;
    const len = key === "nx" || key === "px" ? k.d : k.w;
    const list: V2[] = spans === true ? [[0, len]] : spans;
    for (const [a, b] of list) {
      if (b - a < 0.3) continue;
      const P = (u: number) => {
        const q = u - len / 2;
        const [lx, lz] = key === "nx" ? [-k.w / 2 + 0.06, q] : key === "px" ? [k.w / 2 - 0.06, q] : key === "nz" ? [q, -k.d / 2 + 0.06] : [q, k.d / 2 - 0.06];
        const [x, z] = W(lx, lz);
        return new THREE.Vector3(x, k.y, z);
      };
      addRail(near, P(a + 0.05), P(b - 0.05), rng);
    }
  };
  side(r.nx, "nx"); side(r.px, "px"); side(r.nz, "nz"); side(r.pz, "pz");
}

/** a flight of steps: treads, stringers; solid flights (into the water) get closed side skirts down to the bed */
export function addFlight(main: TownBins, near: TownBins, f: Flight, groundAt: (x: number, z: number) => number, rng: () => number) {
  const yaw = Math.atan2(f.dx, f.dz), rise = (f.yTop - f.yBot) / f.n;
  const rx = f.dz, rz = -f.dx; // local −x in world for this yaw… (only the magnitude matters: ±)
  for (let i = 0; i < f.n; i++) {
    const top = f.yTop - (i + 1) * rise, u = (i + 0.5) * f.tread;
    const x = f.x + f.dx * u, z = f.z + f.dz * u;
    main.woodDark.box(f.w, 0.07, f.tread + 0.05, M(x, top - 0.035, z, yaw, 0, (rng() - 0.5) * 0.01), PLANK().multiplyScalar(0.85 + rng() * 0.25), [rng() * 3, rng()]);
    if (f.solid) {
      // riser + side skirts down to the swamp bed (the collider is solid below the treads)
      const g = Math.min(groundAt(x, z), top - 0.05);
      const hh = top - 0.07 - (g - 0.3);
      if (hh > 0.02) {
        near.wood.box(f.w - 0.04, Math.min(rise, hh), 0.04, M(x + f.dx * (f.tread / 2), top - 0.07 - Math.min(rise, hh) / 2, z + f.dz * (f.tread / 2), yaw), col("#5e4a36"));
        for (const s of [-1, 1]) main.wood.box(0.06, hh, f.tread + 0.03, M(x + rx * s * (f.w / 2 - 0.03), top - 0.07 - hh / 2, z + rz * s * (f.w / 2 - 0.03), yaw), soft("#8a7054", 0.5, 0.85));
      }
    }
  }
  const run = f.n * f.tread, sl = Math.hypot(run, f.yTop - f.yBot), ang = Math.atan2(f.yTop - f.yBot, run);
  if (!f.solid) {
    for (const s of [-1, 1]) {
      const ox = rx * s * (f.w / 2 + 0.04), oz = rz * s * (f.w / 2 + 0.04);
      main.wood.box(0.08, 0.26, sl + 0.1, M(f.x + f.dx * run / 2 + ox, (f.yTop + f.yBot) / 2 - 0.12, f.z + f.dz * run / 2 + oz, yaw, ang), col("#5e4a36"));
      if (f.rails) {
        const a = new THREE.Vector3(f.x + ox, f.yTop, f.z + oz), b = new THREE.Vector3(f.x + f.dx * run + ox, f.yBot, f.z + f.dz * run + oz);
        for (const p of [a, b]) { near.wood.add(cylGeo(0.05, 0.06, 1.1, 7), M(p.x, p.y + 0.55, p.z), col("#7a6450")); addLashing(near, p.x, p.y + 0.85, p.z, 0.06, col(ROPE)); }
        near.rope.add(tubeGeo(catenary(a.clone().setY(a.y + 1.0), b.clone().setY(b.y + 1.0), 0.15, 8), 0.028, 4, false, 9), null, col(ROPE));
      }
    }
    // trestles: the shared flightPosts (their colliders) + a cross brace between each pair
    const posts = flightPosts(f);
    for (const [x, z, top, bot] of posts) addPost(main, x, z, top, bot, 0.07, rng, false);
    for (let i = 0; i + 1 < posts.length; i += 2) {
      const [ax, az, at, ab] = posts[i], [bx, bz, bt, bb] = posts[i + 1];
      const lo = Math.max(ab, bb) + 0.3, hi = Math.min(at, bt) - 0.1;
      if (hi - lo < 0.5) continue;
      const a = new THREE.Vector3(ax, lo, az), b = new THREE.Vector3(bx, hi, bz);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const g = cylGeo(0.035, 0.035, len, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      main.wood.add(g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), col("#6a5238"));
    }
  }
}

/** the Crow's Nest → Stilt House rope bridge: planks on two foot ropes, hand ropes, suspenders, end posts */
export function addBridge(main: TownBins, near: TownBins, rng: () => number) {
  const b = LAYOUT.bridge;
  const dx = b.b[0] - b.a[0], dz = b.b[2] - b.a[2], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const ux = dx / L, uz = dz / L, sx = uz, sz = -ux;
  for (let i = 0; i < b.n; i++) {
    const t = (i + 0.5) / b.n, y = bridgeY(t), t2 = Math.min(1, t + 0.5 / b.n), t1 = Math.max(0, t - 0.5 / b.n);
    const slope = Math.atan2(bridgeY(t2) - bridgeY(t1), (t2 - t1) * L);
    if (rng() < 0.04) continue; // a missing plank now and then (the collider is continuous: the gap is < a foot)
    main.woodDark.box(b.w * (0.92 + rng() * 0.1), 0.05, L / b.n - 0.04, M(b.a[0] + dx * t + sx * (rng() - 0.5) * 0.06, y - 0.03, b.a[2] + dz * t + sz * (rng() - 0.5) * 0.06, yaw + (rng() - 0.5) * 0.06, -slope), PLANK().multiplyScalar(0.8 + rng() * 0.3), [rng() * 3, 0]);
  }
  for (const s of [-1, 1]) {
    const pts = (dy: number, off: number) => { const out: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const t = i / 24; out.push(new THREE.Vector3(b.a[0] + dx * t + sx * s * off, bridgeY(t) + dy, b.a[2] + dz * t + sz * s * off)); } return out; };
    near.rope.add(tubeGeo(pts(-0.06, b.w / 2 - 0.05), 0.035, 5, false, 60), null, col(ROPE, 0.85));
    near.rope.add(tubeGeo(pts(1.2, b.w / 2 + 0.05), 0.04, 5, false, 60), null, col(ROPE));
    // plank parapets (shared bridgeBoxes: the same segments, solid cover): two or three weathered side boards per
    // plank segment, lashed to the hand rope by the suspenders, a gap between them
    for (let i = 0; i < b.n; i++) {
      const t = (i + 0.5) / b.n, y = bridgeY(t), t2 = Math.min(1, t + 0.5 / b.n), t1 = Math.max(0, t - 0.5 / b.n);
      const slope = Math.atan2(bridgeY(t2) - bridgeY(t1), (t2 - t1) * L), seg = L / b.n;
      const nb2 = 2;
      for (let k = 0; k < nb2; k++) {
        const hh = 1.08 + (rng() - 0.5) * 0.06;
        main.clapboard.box(0.035, hh, seg / nb2 - 0.025, M(b.a[0] + dx * t + ux * (k - 0.5) * seg / nb2 + sx * s * (b.w / 2 + 0.03), y + hh / 2 - 0.02, b.a[2] + dz * t + uz * (k - 0.5) * seg / nb2 + sz * s * (b.w / 2 + 0.03), yaw, -slope, (rng() - 0.5) * 0.02), soft("#9a7a5a", 0.5, 0.85 + rng() * 0.3), [rng() * 3, rng() * 3]);
      }
    }
    // suspenders every ~1.2 m
    const n = Math.round(L / 1.2);
    for (let i = 1; i < n; i++) {
      const t = i / n, y = bridgeY(t), top = y + 1.2;
      near.rope.add(cylGeo(0.012, 0.012, top - y, 4), M(b.a[0] + dx * t + sx * s * (b.w / 2 + 0.06), (y + top) / 2, b.a[2] + dz * t + sz * s * (b.w / 2 + 0.06)), col(ROPE, 0.9));
    }
    // end posts
    for (const [p, t] of [[b.a, 0], [b.b, 1]] as Array<[[number, number, number], number]>) {
      const x = p[0] + sx * s * (b.w / 2 + 0.12) + (t ? -ux : ux) * 0.2, z = p[2] + sz * s * (b.w / 2 + 0.12) + (t ? -uz : uz) * 0.2;
      addPost(main, x, z, p[1] + 1.35, p[1] - 0.6, 0.11, rng, true);
    }
  }
}
