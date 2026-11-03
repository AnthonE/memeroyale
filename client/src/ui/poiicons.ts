// POI badges for the full-screen map (every named place reads by its landmark —
// the temple, the lab dish, the harbor cranes, the wreck, the waterfall …). Pure canvas vector glyphs in a 20-unit box,
// dark ink on a banana-gold disc with a dark rim; no images to load.
type Ink = (g: CanvasRenderingContext2D) => void;

const poly = (g: CanvasRenderingContext2D, pts: number[], close = true) => {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
};
const line = (g: CanvasRenderingContext2D, pts: number[]) => { poly(g, pts, false); g.stroke(); };
const disc = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

const GLYPH: Record<string, Ink> = {
  // harbor: a container crane (mast, jib, hook)
  "peel-harbor": (g) => { g.fillRect(-6, -7, 2.4, 15); line(g, [-6, -6, 8, -6]); line(g, [-6, -2, -1, -6]); line(g, [5, -6, 5, 1]); g.fillRect(3, 1, 4, 3); g.fillRect(-9, 7.5, 18, 2); },
  // market: a striped awning over a stall
  "mango-market": (g) => { poly(g, [-9, -3, -7, -8, 7, -8, 9, -3]); g.fill(); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-6.75 + i * 4.5, -3, 2.25, 0, Math.PI); g.fill(); } g.fillRect(-7, -1, 1.8, 9); g.fillRect(5.2, -1, 1.8, 9); g.fillRect(-8, 3, 16, 2.2); },
  // cove: a leaning palm over a beach
  "coconut-cove": (g) => { line(g, [-3, 9, -1, 2, 1, -5]); for (const a of [-2.6, -1.9, -0.6, 0.2]) { g.beginPath(); g.moveTo(1, -5); g.quadraticCurveTo(1 + Math.cos(a) * 5, -5 + Math.sin(a) * 5 - 2, 1 + Math.cos(a) * 9, -5 + Math.sin(a) * 9 + 3); g.stroke(); } disc(g, 2, -3.5, 1.4); g.fillRect(-9, 8, 18, 1.8); },
  // stilt town: a hut on stilts over water
  "stilt-town": (g) => { poly(g, [-8, -2, 0, -9, 8, -2]); g.fill(); g.fillRect(-6, -2, 12, 6); for (const x of [-6, -1, 4]) g.fillRect(x, 4, 1.6, 5); line(g, [-9, 8, -6, 7, -3, 8, 0, 7, 3, 8, 6, 7, 9, 8]); },
  // the murk: swamp reeds and a bubble
  "the-murk": (g) => { for (const [x, h] of [[-5, 13], [-1.5, 16], [2, 11]]) { line(g, [x, 7, x + 0.6, 7 - h]); g.beginPath(); g.ellipse(x + 0.6, 7 - h + 2.5, 1.3, 3, 0, 0, Math.PI * 2); g.fill(); } g.beginPath(); g.arc(6, 1, 2.2, 0, Math.PI * 2); g.stroke(); line(g, [-9, 8, -5, 6.5, -1, 8, 3, 6.5, 7, 8, 9, 7]); },
  // banana temple: a stepped pyramid with a shrine on top
  "banana-temple": (g) => { g.fillRect(-9, 5, 18, 3.5); g.fillRect(-6.5, 1.2, 13, 3.8); g.fillRect(-4, -2.6, 8, 3.8); g.fillRect(-2, -7, 4, 4.4); g.fillRect(-0.8, -1, 1.6, 9.5); },
  // ripe peak: a volcano with a plume
  "ripe-peak": (g) => { poly(g, [-10, 8, -3, -4, 3, -4, 10, 8]); g.fill(); g.beginPath(); g.arc(-1, -7, 2.4, 0, Math.PI * 2); g.arc(2.5, -8.2, 2, 0, Math.PI * 2); g.fill(); },
  // mist falls: a cliff, the fall, the splash
  "mist-falls": (g) => { poly(g, [-9, -8, -1, -8, -1, 0, -9, 8]); g.fill(); for (const x of [1, 3.5, 6]) line(g, [x, -7, x, 4]); g.beginPath(); g.ellipse(3.5, 6.5, 6, 2, 0, 0, Math.PI * 2); g.fill(); },
  // cnvs lab: a radar dish on a mast
  "cnvs-lab": (g) => { g.beginPath(); g.ellipse(-1, -2, 7.5, 4, -0.7, 0, Math.PI); g.fill(); line(g, [0, -1, 4, -6]); disc(g, 4.4, -6.4, 1.3); g.fillRect(-1.5, 1, 3, 6); g.fillRect(-6, 7, 12, 2); },
  // canopy line: a tree with a platform and a zipline
  "canopy-line": (g) => { disc(g, -3, -4, 5.5); g.fillRect(-4, 0, 2.2, 9); g.fillRect(-8, 1.5, 9, 1.6); line(g, [1, -2, 9.5, 5]); disc(g, 6, 2.2, 1.3); },
  // peel strip: a little plane
  "peel-strip": (g) => { poly(g, [-1.4, -9, 1.4, -9, 1.6, 8, -1.6, 8]); g.fill(); poly(g, [-9.5, -1, 9.5, -1, 9.5, 2, -9.5, 2]); g.fill(); poly(g, [-4, 6.5, 4, 6.5, 4, 8.5, -4, 8.5]); g.fill(); },
  // the plantation: a banana bunch
  "the-plantation": (g) => { for (const [a, o] of [[-0.5, -4], [0, 0], [0.5, 4]]) { g.save(); g.translate(o, 1); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 2.2, 7, 0, 0, Math.PI * 2); g.fill(); g.restore(); } g.fillRect(-1, -9, 2, 4); },
  // lookout point: a lighthouse
  "lookout-point": (g) => { poly(g, [-4, 9, -2.5, -4, 2.5, -4, 4, 9]); g.fill(); g.fillRect(-3.5, -7.5, 7, 3); poly(g, [-3, -7.5, 0, -10, 3, -7.5]); g.fill(); line(g, [4.5, -6, 9, -8]); line(g, [-4.5, -6, -9, -8]); },
  // the wreck: a broken hull, listing
  "the-wreck": (g) => { g.save(); g.rotate(-0.25); poly(g, [-9, 0, 9, 0, 6, 6, -6, 6]); g.fill(); g.fillRect(-1, -9, 1.8, 9); poly(g, [0.8, -8, 6, -3, 0.8, -3]); g.fill(); g.restore(); line(g, [-9, 9, -5, 7.5, -1, 9, 3, 7.5, 7, 9]); },
  // coco caves: a cave mouth in a rock
  "coco-caves": (g) => { poly(g, [-10, 8, -7, -4, -2, -8, 4, -7, 9, -2, 10, 8]); g.fill(); g.save(); g.fillStyle = "#ffd21f"; g.beginPath(); g.moveTo(-4.5, 8); g.lineTo(-4.5, 2); g.arc(0, 2, 4.5, Math.PI, 0); g.lineTo(4.5, 8); g.closePath(); g.fill(); g.restore(); },
  // wreck bay: an anchor
  "wreck-bay": (g) => { g.beginPath(); g.arc(0, -7, 2.2, 0, Math.PI * 2); g.stroke(); line(g, [0, -4.8, 0, 8]); line(g, [-4, -2, 4, -2]); g.beginPath(); g.arc(0, 2, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); },
};

/** a POI badge centred on (x, y), radius r (px) */
export function drawPoiIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, r: number): void {
  const ink = GLYPH[id];
  g.save();
  g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = r * 0.35; g.shadowOffsetY = r * 0.12;
  g.fillStyle = "rgba(14,11,6,0.94)"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.fillStyle = "#ffd21f"; g.beginPath(); g.arc(x, y, r * 0.84, 0, Math.PI * 2); g.fill();
  if (ink) {
    g.translate(x, y); const k = (r * 0.62) / 10; g.scale(k, k);
    g.fillStyle = "#17120a"; g.strokeStyle = "#17120a"; g.lineWidth = 1.7; g.lineCap = "round"; g.lineJoin = "round";
    ink(g);
  }
  g.restore();
}
