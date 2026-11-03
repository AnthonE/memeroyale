// Shared materials + canvas-painted textures for the weapons area. Palette from the target art: ripe-banana yellow,
// cream flesh, chocolate brown, lime stem green, rope tan, crate wood. Materials are singletons (one program each).
import * as THREE from "three";
import { TOON_SKIP_MAPS } from "./toon";

export const C = {
  // sampled from the gear-03-weapons + loot-01 target art (sRGB): ripe LEMON yellow lit #fee55d, mid #f7c109, shade #c99505.
  // albedo pushed from #ffd200 (hue 49°) to #ffe135 (hue 52°) — the grade + tone shoulder turn the hue ~4° warmer,
  // so this lands on the target art's lemon (sim: display #f2d54b hue 50° at the studio key). Then #ffe83c (hue 54°): the
  // atmos warm bounce + paint streaks still warmed the measured body mid to hue 44-45° (target art mid #fdcd08 hue 48°)
  // then saturation up (a paler butter yellow misses the target art's saturated lemon) at the same hue — lit #ffe414
  // (S 92 %), mid = the target art's #f7c109
  banana: "#ffe600", bananaDeep: "#f7c400", cream: "#f5e4b8", creamDeep: "#e4cb92", flesh: "#f9ecc6",
  brown: "#6b3e22", brownDark: "#452614", brownLight: "#8a5432", lime: "#8fbe3c", limeDark: "#5f8f22",
  rope: "#d2b078", wood: "#a8703f", woodDark: "#6b4326", steel: "#b9bec6", steelDark: "#5c6168",
  gold: "#f4b90e", goldDeep: "#c98d05", olive: "#6f7d3a", leaf: "#579a2a", leafDark: "#2f6b1a", coconut: "#5a3a22",
  red: "#c8392b", canvas: "#e8dcc0", pink: "#e8608a", white: "#ffffff",
};

export type Kind = "gloss" | "matte" | "metal" | "rope" | "slice" | "emissive" | "fur" | "leaf" | "chrome" | "glass" | "gold";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return { c, x: c.getContext("2d")! };
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
/** tiny deterministic PRNG */
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** normal map from a height function (tileable) */
export function heightToNormal(w: number, h: number, height: (u: number, v: number) => number, strength = 2): THREE.CanvasTexture {
  const { c, x } = canvas(w, h);
  const img = x.createImageData(w, h);
  const H = (i: number, j: number) => height(((i + w) % w) / w, ((j + h) % h) / h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * strength, dy = (H(i, j + 1) - H(i, j - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const k = (j * w + i) * 4;
    img.data[k] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, false);
}

/** subtle hand-painted variation: near-white streaks + faint speckles (multiplies vertex colour) */
export function paintTex(size = 256): THREE.CanvasTexture {
  const { c, x } = canvas(size, size);
  x.fillStyle = "#fff"; x.fillRect(0, 0, size, size);
  const r = rng(7);
  for (let i = 0; i < 900; i++) {
    x.strokeStyle = `rgba(120,80,20,${0.015 + r() * 0.025})`;
    x.lineWidth = 1 + r() * 2;
    const px = r() * size, py = r() * size, len = 8 + r() * 40;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py + (r() - 0.5) * 4); x.stroke();
  }
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(150,100,30,${0.015 + r() * 0.025})`;
    x.beginPath(); x.arc(r() * size, r() * size, 0.6 + r() * 1.8, 0, Math.PI * 2); x.fill();
  }
  const t = tex(c); t.repeat.set(1, 1); return t;
}

/** banana slice face (no black splat): cream flesh disc, a thin darker peel ring, a SMALL five-petal
 *  seed star in pale cream outlined in soft tan at the centre, five tiny dark seeds between the petals */
export function sliceTex(size = 256): THREE.CanvasTexture {
  const { c, x } = canvas(size, size);
  const m = size / 2;
  const grd = x.createRadialGradient(m, m, 0, m, m, m);
  grd.addColorStop(0, "#fdf3d2"); grd.addColorStop(0.7, "#f6e5b0"); grd.addColorStop(0.9, "#ead08e"); grd.addColorStop(1, "#dcbd74");
  x.fillStyle = grd; x.fillRect(0, 0, size, size);
  x.strokeStyle = "rgba(190,150,80,.55)"; x.lineWidth = size * 0.025;
  x.beginPath(); x.arc(m, m, m * 0.84, 0, Math.PI * 2); x.stroke();
  // faint radial flesh fibres
  x.strokeStyle = "rgba(220,190,120,.25)"; x.lineWidth = 1.5;
  for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2; x.beginPath(); x.moveTo(m + Math.cos(a) * m * 0.3, m + Math.sin(a) * m * 0.3); x.lineTo(m + Math.cos(a) * m * 0.78, m + Math.sin(a) * m * 0.78); x.stroke(); }
  // (target-art crop: a star of six thin TAPERED dark-tan spokes reaching ~55 % of the radius, a ring of tiny dark seeds
  // at the hub) — a five-petal cream flower was too small / faint to read at sheet or viewmodel scale
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 - Math.PI / 2 + (k % 2 ? 0.08 : -0.05);
    const L = m * (k % 2 ? 0.5 : 0.58), w0 = size * 0.022;
    x.save(); x.translate(m, m); x.rotate(a);
    x.fillStyle = "rgba(150,108,40,.85)";
    x.beginPath(); x.moveTo(0, -w0); x.quadraticCurveTo(L * 0.5, -w0 * 0.7, L, 0); x.quadraticCurveTo(L * 0.5, w0 * 0.7, 0, w0); x.closePath(); x.fill();
    x.restore();
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6;
    x.fillStyle = "rgba(70,45,18,.9)"; x.beginPath(); x.arc(m + Math.cos(a) * m * 0.1, m + Math.sin(a) * m * 0.1, size * 0.014, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = "rgba(120,85,35,.9)"; x.beginPath(); x.arc(m, m, size * 0.02, 0, Math.PI * 2); x.fill();
  return tex(c, true, false);
}

/** twisted rope normal map: strands run diagonally so a tube with u along the rope shows a braid */
export function ropeNormalTex(): THREE.CanvasTexture {
  return heightToNormal(64, 64, (u, v) => {
    const s = Math.sin((u * 1 + v * 2) * Math.PI * 2);
    return 0.5 + 0.5 * Math.pow(Math.max(0, s), 0.6) - 0.15 * Math.abs(Math.sin(v * Math.PI * 6));
  }, 4);
}

/** fur: dense short strokes → normal + roughness variation */
export function furNormalTex(): THREE.CanvasTexture {
  const r = rng(3);
  const strokes: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 700; i++) strokes.push([r(), r(), (r() - 0.5) * 0.06, 0.02 + r() * 0.05]);
  return heightToNormal(128, 128, (u, v) => {
    let h = 0;
    for (const [sx, sy, dx, len] of strokes) {
      const t = ((u - sx) * dx + (v - sy) * len) / (dx * dx + len * len);
      if (t < 0 || t > 1) continue;
      const px = sx + dx * t, py = sy + len * t;
      const d = Math.hypot(u - px, v - py);
      if (d < 0.006) h += (1 - d / 0.006) * 0.5;
    }
    return Math.min(1, h);
  }, 1.5);
}

/** banana silhouette path (fat crescent with a stem nub and a tip), centred at (cx,cy), size s (≈ length), rotated */
export function bananaPath(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot = -0.6) {
  x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(s, s);
  x.beginPath();
  x.moveTo(-0.52, 0.02);                                   // stem end
  x.bezierCurveTo(-0.45, -0.22, -0.1, -0.4, 0.3, -0.36);   // outer (back) curve
  x.bezierCurveTo(0.45, -0.34, 0.55, -0.3, 0.56, -0.24);   // tip
  x.bezierCurveTo(0.5, -0.14, 0.2, -0.02, -0.15, 0.06);    // inner (belly) curve
  x.bezierCurveTo(-0.3, 0.1, -0.45, 0.12, -0.5, 0.08);
  x.closePath();
  x.restore();
}

/** BANANA CO. bunch emblem (line art, the target art's rocket / crate stencil): three outlined bananas fanned from a shared
 *  stem, back to front — each FILLED with `ground` (so the front ones hide the back ones) and stroked in `col` */
export function paintBunch(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, col: string, ground: string, lw = 0.055) {
  x.save(); x.lineJoin = "round"; x.lineCap = "round"; x.lineWidth = s * lw; x.strokeStyle = col;
  for (let i = 0; i < 3; i++) {
    const rot = -1.05 + i * 0.32;
    bananaPath(x, cx + s * (0.02 + i * 0.07), cy + s * (-0.06 + i * 0.1), s * (1.02 - i * 0.04), rot);
    x.fillStyle = ground; x.fill(); x.stroke();
  }
  // shared stem: a short stub up-left of the bunch
  x.beginPath(); x.moveTo(cx - s * 0.3, cy - s * 0.3); x.lineTo(cx - s * 0.42, cy - s * 0.46); x.lineWidth = s * lw * 1.8; x.stroke();
  x.restore();
}

/** KONG face emblem (the target art's medallion / stencil: a gruff gorilla head, front view) painted into a canvas at
 *  (cx, cy), size s ≈ half the head height. fg = the face colour, dark = the cut lines / features, light = the muzzle
 *  (defaults to fg). Head dome + heavy V brow, deep-set eyes, big rounded muzzle with flared nostrils, a flat frown,
 *  side ears; optional 3-point crown. Reads as a GORILLA at 40 px (not a pig nose or a sad helmet face). */
export function paintKong(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, fg: string, dark: string, o: { light?: string; crown?: boolean; line?: number } = {}) {
  // the target art's emblem is NEGATIVE-SPACE line art — a thick head OUTLINE band
  // (flat-topped crest → flared cheeks), a dark forehead, a heavy M-shaped BROW, glaring eye slits in dark sockets, a
  // nose bridge ending in two big nostrils, a HUGE rounded muzzle (the lower half of the face) with a flat mouth line,
  // C-shaped ears. fg = the emblem colour, dark = the ground / cut colour, light = the muzzle (defaults to fg).
  const P = (u: number, v: number): [number, number] => [cx + u * s, cy + v * s];
  const lw = (o.line ?? 0.07) * s;
  x.save(); x.lineJoin = "round"; x.lineCap = "round";
  const poly = (pts: Array<[number, number]>) => { x.beginPath(); pts.forEach(([u, v], i) => { const [px, py] = P(u, v); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); };
  const bz = (c1: [number, number], c2: [number, number], e: [number, number]) => { const [a, b] = P(...c1), [c, d] = P(...c2), [e1, e2] = P(...e); x.bezierCurveTo(a, b, c, d, e1, e2); };
  const ell = (u: number, v: number, rx: number, ry: number, rot = 0) => { x.beginPath(); const [a, b] = P(u, v); x.ellipse(a, b, rx * s, ry * s, rot, 0, Math.PI * 2); };
  /** head silhouette scaled by k about (0, 0.1): flat-topped crest, temples, flared cheeks, jaw into the muzzle */
  const head = (k: number) => {
    const Q = (u: number, v: number): [number, number] => [u * k, 0.1 + (v - 0.1) * k];
    x.beginPath(); { const [a, b] = P(...Q(-0.3, -0.98)); x.moveTo(a, b); }
    { const [a, b] = P(...Q(0.3, -0.98)); x.lineTo(a, b); }
    bz(Q(0.52, -0.94), Q(0.7, -0.62), Q(0.76, -0.3)); bz(Q(0.84, 0.02), Q(0.86, 0.34), Q(0.7, 0.56));
    bz(Q(0.4, 0.84), Q(-0.4, 0.84), Q(-0.7, 0.56)); bz(Q(-0.86, 0.34), Q(-0.84, 0.02), Q(-0.76, -0.3));
    bz(Q(-0.7, -0.62), Q(-0.52, -0.94), Q(-0.3, -0.98)); x.closePath();
  };
  // ears: fg C shapes outside the outline
  for (const sx of [-1, 1]) { x.fillStyle = fg; ell(sx * 0.88, 0.02, 0.17, 0.24); x.fill(); x.fillStyle = dark; ell(sx * 0.9, 0.04, 0.08, 0.14); x.fill(); }
  // outline band: the head in fg, the inside cut back to dark
  x.fillStyle = fg; head(1); x.fill();
  x.fillStyle = dark; head(0.8); x.fill();
  // heavy M brow (fg), spanning the head
  x.fillStyle = fg;
  poly([[-0.66, -0.12], [-0.5, -0.38], [-0.26, -0.47], [-0.06, -0.36], [0, -0.3], [0.06, -0.36], [0.26, -0.47], [0.5, -0.38], [0.66, -0.12], [0.5, -0.1], [0.3, -0.22], [0.1, -0.16], [0, -0.1], [-0.1, -0.16], [-0.3, -0.22], [-0.5, -0.1]]); x.fill();
  // glaring eye slits (fg) in the dark sockets under the brow
  for (const sx of [-1, 1]) { poly([[sx * 0.14, -0.06], [sx * 0.28, -0.13], [sx * 0.44, -0.07], [sx * 0.3, -0.01]]); x.fill(); }
  // nose bridge (fg) from between the eyes, widening to the nostril pad
  poly([[-0.07, -0.08], [0.07, -0.08], [0.12, 0.04], [0.26, 0.16], [0.24, 0.26], [-0.24, 0.26], [-0.26, 0.16], [-0.12, 0.04]]); x.fill();
  // muzzle: a huge rounded lower face (bulges past the outline band like the target art's)
  x.fillStyle = o.light ?? fg; ell(0, 0.56, 0.58, 0.4); x.fill();
  // cuts: nostrils, the nose/muzzle split, the mouth
  x.fillStyle = dark;
  for (const sx of [-1, 1]) { ell(sx * 0.11, 0.17, 0.075, 0.05, sx * 0.35); x.fill(); }
  x.strokeStyle = dark; x.lineWidth = lw;
  x.beginPath(); { const [a, b] = P(-0.3, 0.3); x.moveTo(a, b); } bz([-0.12, 0.25], [0.12, 0.25], [0.3, 0.3]); x.stroke();
  x.beginPath(); { const [a, b] = P(-0.4, 0.66); x.moveTo(a, b); } bz([-0.15, 0.6], [0.15, 0.6], [0.4, 0.66]); x.stroke();
  if (o.crown) {
    x.fillStyle = fg;
    poly([[-0.34, -1.06], [-0.42, -1.5], [-0.18, -1.26], [0, -1.56], [0.18, -1.26], [0.42, -1.5], [0.34, -1.06]]); x.fill();
  }
  x.restore();
}


/** transparent stencil decal (text + logo), dark brown, distressed */
export function stencilTex(text = "BANANA CO.", size = 512, color = "rgba(70,40,15,.85)", logo = true): THREE.CanvasTexture {
  const { c, x } = canvas(size, size / 2);
  const r = rng(5);
  x.fillStyle = color;
  if (logo) { bananaPath(x, size * 0.5, size * 0.15, size * 0.3, -0.5); x.fill(); }
  x.font = `900 ${Math.round(size * (logo ? 0.13 : 0.2))}px "Arial Black", Impact, Helvetica, sans-serif`;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, size * 0.5, size * (logo ? 0.36 : 0.25), size * 0.9);
  x.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${r() * 0.6})`; x.beginPath(); x.arc(r() * size, r() * size / 2, r() * 2, 0, Math.PI * 2); x.fill(); }
  return tex(c, true, false);
}


/** soft radial glow sprite (white centre → transparent) */
export function glowTex(size = 128, power = 2): THREE.CanvasTexture {
  const { c, x } = canvas(size, size);
  const img = x.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot(i - size / 2 + 0.5, j - size / 2 + 0.5) / (size / 2);
    const a = Math.pow(Math.max(0, 1 - d), power);
    const k = (j * size + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, true, false);
}

/** 4-point sparkle sprite */
export function sparkTex(size = 64): THREE.CanvasTexture {
  const { c, x } = canvas(size, size);
  const m = size / 2;
  const g = x.createRadialGradient(m, m, 0, m, m, m); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.fillStyle = "rgba(255,255,255,1)";
  x.beginPath();
  x.moveTo(m, 0); x.quadraticCurveTo(m, m, size, m); x.quadraticCurveTo(m, m, m, size); x.quadraticCurveTo(m, m, 0, m); x.quadraticCurveTo(m, m, m, 0);
  x.fill();
  return tex(c, true, false);
}

/** leaf albedo: green with a midrib and veins */
export function leafTex(size = 256): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const { c, x } = canvas(size, size);
  const g = x.createLinearGradient(0, 0, 0, size); g.addColorStop(0, "#5aa832"); g.addColorStop(0.5, "#4a9a2c"); g.addColorStop(1, "#3d8724");
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.strokeStyle = "rgba(200,230,120,.55)"; x.lineWidth = 5; x.beginPath(); x.moveTo(0, size / 2); x.lineTo(size, size / 2); x.stroke();
  x.strokeStyle = "rgba(30,80,20,.35)"; x.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { const px = (i / 26) * size; x.beginPath(); x.moveTo(px, size / 2); x.lineTo(px + size * 0.12, 0); x.moveTo(px, size / 2); x.lineTo(px + size * 0.12, size); x.stroke(); }
  const normalMap = heightToNormal(128, 128, (u, v) => 0.5 + 0.5 * Math.sin(u * Math.PI * 26 - v * 3) * 0.3 + (Math.abs(v - 0.5) < 0.02 ? 0.4 : 0), 2);
  return { map: tex(c), normalMap };
}


/** bamboo culm texture: green, with darker nodes and fine vertical striations */
export function bambooTex(size = 256, base = "#7fa63a"): THREE.CanvasTexture {
  const { c, x } = canvas(size, size);
  const r = rng(9);
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 300; i++) { x.strokeStyle = `rgba(30,60,10,${0.05 + r() * 0.12})`; x.lineWidth = 0.5 + r(); const px = r() * size; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (r() - 0.5) * 3, size); x.stroke(); }
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(230,240,180,${0.05 + r() * 0.1})`; x.lineWidth = 0.5 + r() * 1.5; const px = r() * size; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, size); x.stroke(); }
  return tex(c);
}

/** Stylized studio glint: a dielectric's real specular is ~4 % — a white
 *  softbox reflection adds nothing visible to a lit yellow. The target art's cel highlights are near-white BANDS along every
 *  tube. This adds an analytic softbox reflection to the material's outgoing light: a ring of light 22°-50° above the
 *  horizon (a long band along the upper-front shoulder of every tube / facet, whatever the view azimuth), a thin
 *  horizon line (the top ridge) and a tight key glint toward the atmos sun. Fresnel-boosted at grazing angles.
 *  Chains before the atmos patch (atmos calls the previous hook first), so cloud shadow / haze apply on top. */
/** global glint strength: the studio stages set 1 (product-sheet highlight bands); in the world 0.5 (the real sun + sky
 *  reflections already give highlights — full strength washed the viewmodel's tops white) */
export const GLINT = { value: 0.5 };
export const GLINT_COLOR = { value: new THREE.Color(1.0, 0.985, 0.95) };
export function addGlint(m: THREE.Material, k: number, o: { ring?: number; line?: number; key?: number; rough?: boolean } = {}) {
  const K = { value: k };
  const ring = (o.ring ?? 1).toFixed(3), line = (o.line ?? 0.45).toFixed(3), key = (o.key ?? 1.3).toFixed(3);
  m.userData.glintK = K;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, r) {
    prev?.call(this, shader, r);
    shader.uniforms.uWpnGlint = GLINT; shader.uniforms.uWpnGlintK = K; shader.uniforms.uWpnGlintCol = GLINT_COLOR;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWpnGlint; uniform float uWpnGlintK; uniform vec3 uWpnGlintCol;")
      .replace("#include <opaque_fragment>", `{
    vec3 gV = normalize( vViewPosition );
    vec3 gR = inverseTransformDirection( reflect( -gV, normal ), viewMatrix );
    float gNV = clamp( dot( normal, gV ), 0.0, 1.0 );
    float gE = gR.y;
    float gRing = smoothstep( 0.34, 0.44, gE ) * ( 1.0 - smoothstep( 0.7, 0.82, gE ) );
    float gLine = smoothstep( 0.03, 0.08, gE ) * ( 1.0 - smoothstep( 0.12, 0.18, gE ) );
    float gKey = 0.0;
#if defined( ATMOS_LIT )
    gKey = pow( max( dot( gR, uAtmSunDir ), 0.0 ), 60.0 );
#endif
    float gF = 0.5 + 0.5 * pow( 1.0 - gNV, 2.0 );
    ${o.rough ? "gF *= 1.0 - smoothstep( 0.3, 0.62, roughnessFactor );" : ""}
    outgoingLight += uWpnGlintCol * ( gRing * ${ring} + gLine * ${line} + gKey * ${key} ) * gF * uWpnGlint * uWpnGlintK;
  }
#include <opaque_fragment>`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + `|wglint${ring}${line}${key}${o.rough ? "r" : ""}`;
  m.needsUpdate = true;
  return m;
}

/** hand-painted surface detail for the shared gun
 *  materials, all procedural in OBJECT space (stable on moving guns, zero textures):
 *   - brush-tone variation (low-frequency ±7 % value / hue shift) on every paint colour
 *   - banana skins only (yellow vertex colours): brown sugar-spot flecks + faint long fibre streaks along the peel
 *   - edge wear on convex ridges (screen-space normal curvature): paint worn pale on yellows, lighter + scuffed on browns
 *  Chains before the glint / atmos hooks. */
export function addPaint(m: THREE.Material, amount = 1) {
  if (m.userData.wpnPaint) return m;
  m.userData.wpnPaint = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, r) {
    prev?.call(this, shader, r);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWpnObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWpnObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vWpnObj;
float wpH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wpN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wpH(i), wpH(i + vec3(1,0,0)), f.x), mix(wpH(i + vec3(0,1,0)), wpH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wpH(i + vec3(0,0,1)), wpH(i + vec3(1,0,1)), f.x), mix(wpH(i + vec3(0,1,1)), wpH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  vec3 P = vWpnObj;
  vec3 base = diffuseColor.rgb;
  float yel = smoothstep(0.3, 0.55, base.r - base.b) * smoothstep(0.35, 0.5, base.g) * smoothstep(0.22, 0.1, base.b);
  float lum = dot(base, vec3(0.3, 0.59, 0.11));
  // brush tone
  float tone = wpN(P * 9.0) * 0.6 + wpN(P * 23.0) * 0.4;
  diffuseColor.rgb *= 1.0 + (tone - 0.5) * 0.14 * ${amount.toFixed(2)};
  // banana skin: fibre streaks + sugar-spot flecks
  float fib = wpN(vec3(P.x * 160.0, P.y * 160.0, P.z * 9.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.86, 0.7), yel * smoothstep(0.55, 0.9, fib) * 0.5 * ${amount.toFixed(2)});
  float sp = wpN(P * 62.0 + 3.1) * 0.7 + wpN(P * 140.0) * 0.3;
  float spot = smoothstep(0.8, 0.85, sp) * smoothstep(0.45, 0.8, wpN(P * 7.0 + 11.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.18, 0.04), yel * spot * 0.6 * ${amount.toFixed(2)});
  // edge wear on convex ridges (screen-space curvature of the shading normal)
  float cv = length(fwidth(normal)) / max(length(fwidth(vViewPosition)), 1e-5);
  // wider + stronger worn edges (pale chipped paint on the
  // yellows, scuffed light wood on the browns), and a thin dark grime line just inside each worn edge (hand-painted look)
  float wn = wpN(P * 31.0 + 5.0);
  float wear = smoothstep(12.0, 46.0, cv) * smoothstep(0.28, 0.62, wn);
  float grime = smoothstep(6.0, 14.0, cv) * (1.0 - smoothstep(14.0, 30.0, cv)) * smoothstep(0.4, 0.7, wpN(P * 17.0 + 2.0));
  diffuseColor.rgb *= 1.0 - grime * 0.22 * ${amount.toFixed(2)};
  // the pale wear tint must not desaturate the whole yellow body (sat 0.66 vs the target 0.81): worn paint on the
  // yellows goes to a light SATURATED lemon, not cream, and a little less of it
  vec3 worn = mix(diffuseColor.rgb * 1.3 + 0.08, vec3(1.0, 0.93, 0.42), yel * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, min(worn, vec3(1.0)), wear * (0.4 + 0.25 * (1.0 - lum)) * ${amount.toFixed(2)});
}`);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + `|wpaint${amount.toFixed(2)}`;
  m.needsUpdate = true;
  return m;
}

export interface Mats {
  gloss: THREE.MeshPhysicalMaterial; matte: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; chrome: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial; slice: THREE.MeshStandardMaterial; emissive: THREE.MeshBasicMaterial; fur: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial; glass: THREE.MeshPhysicalMaterial; gold: THREE.MeshPhysicalMaterial;
  paint: THREE.CanvasTexture; ropeNormal: THREE.CanvasTexture; glow: THREE.CanvasTexture; spark: THREE.CanvasTexture;
  byKind(k: Kind): THREE.Material;
}

let cached: Mats | null = null;
export function mats(): Mats {
  if (cached) return cached;
  const paint = paintTex(), ropeNormal = ropeNormalTex(), leaf = leafTex();
  // toy-glossy: sharp clearcoat highlight blobs like the target art's cel highlights; env kept low so the world's
  // blue sky IBL never turns the yellows olive
  // a satin painted finish (clearcoat 0.5 / 0.1 read as plastic) + procedural paint detail (addPaint)
  const gloss = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: paint, roughness: 0.4, metalness: 0, clearcoat: 0.28, clearcoatRoughness: 0.26, envMapIntensity: 0.3, specularIntensity: 0.55 });
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, map: paint, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, envMapIntensity: 1.2 });
  // highlight bands (the target art's cel highlights) — strong on the glossy banana skins, a leather sheen on the browns
  addPaint(gloss); addPaint(matte, 0.8);
  addGlint(gloss, 0.5); addGlint(matte, 0.16, { key: 0.6 }); addGlint(metal, 0.3);
  const chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.95 });
  const ropeM = new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: ropeNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 });
  const slice = new THREE.MeshStandardMaterial({ map: sliceTex(), roughness: 0.5, metalness: 0 });
  const emissive = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const fur = new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: furNormalTex(), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.95, metalness: 0 });
  const leafM = new THREE.MeshStandardMaterial({ map: leaf.map, normalMap: leaf.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  // (perf) NO transmission: one visible transmissive material makes three re-render every opaque object
  // into a 4× MSAA half-float target each frame (and re-pick every program for it) — the Banana Stand's coin jar cost
  // 3–6 ms a frame wherever a stand was in view. A clear-coated transparent look reads the same at a jar's size.
  const glass = new THREE.MeshPhysicalMaterial({ color: "#e8f4ff", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, depthWrite: false });
  // toon gold: warm base colour survives without an env map, strong sharp highlights from the lights
  const gold = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.8, specularIntensity: 1.2 });
  gold.name = "wpn-gold";
  for (const m of [gloss, matte, metal, chrome, ropeM, slice, fur, leafM]) m.name = "wpn-" + (m === gloss ? "gloss" : m === matte ? "matte" : m === metal ? "metal" : m === chrome ? "chrome" : m === ropeM ? "rope" : m === slice ? "slice" : m === fur ? "fur" : "leaf");
  const all = { gloss, matte, metal, chrome, rope: ropeM, slice, emissive, fur, leaf: leafM, glass, gold };
  cached = { ...all, paint, ropeNormal, glow: glowTex(), spark: sparkTex(), byKind: (k) => all[k] };
  TOON_SKIP_MAPS.add(paint);
  return cached;
}
