// A small dependency-free QR code encoder for the admin console's invite card: the player-invite URL
// (…/kong/?e=AB3CDE) drawn as a QR so a phone can join from the screen. Byte mode (UTF-8), error correction level M,
// the smallest version 1–10 that fits (~213 bytes max), Reed–Solomon over GF(256), block interleaving, all 8 masks
// scored by the ISO 18004 penalty rules. Follows the spec (and Nayuki's reference layout); its output decodes with
// zbarimg and matches qrencode module for module.

/** level M per version 1–10: [EC codewords per block, blocks in group 1, data codewords per group-1 block, blocks in group 2] (group-2 blocks hold one more) */
const EC_M: ReadonlyArray<readonly [number, number, number, number]> = [
  [10, 1, 16, 0], [16, 1, 28, 0], [26, 1, 44, 0], [18, 2, 32, 0], [24, 2, 43, 0],
  [16, 4, 27, 0], [18, 4, 31, 0], [22, 2, 38, 2], [22, 3, 36, 2], [26, 4, 43, 1],
];
/** alignment pattern centres per version (row and column coordinates) */
const ALIGN: ReadonlyArray<readonly number[]> = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ---- GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D) ----
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** generator polynomial ∏(x − α^i), i < n — coefficients high → low, leading 1 dropped */
function rsGenerator(n: number): Uint8Array {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return Uint8Array.from(g.slice(1));
}

/** the n EC codewords: remainder of data·x^n divided by the generator */
function rsRemainder(data: ArrayLike<number>, gen: Uint8Array): number[] {
  const rem = new Array<number>(gen.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    const f = data[i] ^ rem.shift()!;
    rem.push(0);
    for (let j = 0; j < gen.length; j++) rem[j] ^= gmul(gen[j], f);
  }
  return rem;
}

const dataCodewords = (v: number): number => { const [, b1, d1, b2] = EC_M[v - 1]; return b1 * d1 + b2 * (d1 + 1); };

/** the full codeword sequence (data + EC, interleaved) for `bytes` at version v */
function codewords(bytes: Uint8Array, v: number): number[] {
  const cap = dataCodewords(v);
  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);                       // byte mode
  put(bytes.length, v < 10 ? 8 : 16);   // character count
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);

  const [ecLen, b1, d1, b2] = EC_M[v - 1];
  const gen = rsGenerator(ecLen);
  const blocks: number[][] = [], ecs: number[][] = [];
  for (let b = 0, off = 0; b < b1 + b2; b++) {
    const len = d1 + (b < b1 ? 0 : 1);
    const blk = data.slice(off, off + len);
    off += len;
    blocks.push(blk); ecs.push(rsRemainder(blk, gen));
  }
  const out: number[] = [];
  for (let i = 0; i <= d1; i++) for (const blk of blocks) if (i < blk.length) out.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const ec of ecs) out.push(ec[i]);
  return out;
}

/** BCH remainder of `data` (already shifted left by the generator's degree) */
function bch(data: number, gen: number, deg: number): number {
  let rem = data;
  for (let i = 31 - Math.clz32(rem); i >= deg; i = 31 - Math.clz32(rem)) rem ^= gen << (i - deg);
  return rem;
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** N1 + N3 for one row / column given as alternating run lengths, starting with a light run (0 when it starts dark).
 * N1: a run of 5+ costs 3 + (len − 5). N3: a dark run of 3k flanked by dark/light/…/light/dark runs of k (1:1:3:1:1 at
 * any scale) with ≥ 4k light on either side — or light all the way to the symbol's edge, or the edge itself — costs 40. */
function runPenalty(runs: number[]): number {
  let score = 0;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i] >= 5) score += 3 + (runs[i] - 5);
    if (i % 2 === 1 && i >= 3 && i + 2 < runs.length && runs[i] % 3 === 0) {
      const k = runs[i] / 3;
      if (runs[i - 2] === k && runs[i - 1] === k && runs[i + 1] === k && runs[i + 2] === k
        && (i === 3 || runs[i - 3] >= 4 * k || i + 4 >= runs.length || runs[i + 3] >= 4 * k)) score += 40;
    }
  }
  return score;
}

/** the ISO 18004 penalty score (rules N1–N4) of a finished matrix — the run-length reading libqrencode uses, so the
 * chosen mask matches qrencode's */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0, dark = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const at = (j: number) => (pass ? m[j][i] : m[i][j]);
      const runs = at(0) ? [0, 1] : [1];
      for (let j = 1; j < n; j++) { if (at(j) === at(j - 1)) runs[runs.length - 1]++; else runs.push(1); }
      score += runPenalty(runs);
    }
  }
  // N2: 2×2 blocks of one colour
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  // N4: 10 per full 5% the (rounded) dark percentage is away from 50%
  for (const row of m) for (const c of row) if (c) dark++;
  const pct = Math.floor((200 * dark + n * n) / (n * n) / 2);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** the QR modules (true = dark), quiet zone NOT included */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(v) * 8) v++;
  if (v > 10) throw new Error(`qr: ${bytes.length} bytes doesn't fit a version 1–10 QR code at level M (max 213 bytes)`);
  const size = 17 + 4 * v;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };

  // timing patterns, then finders (with separators), alignment patterns, the dark module
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[v - 1];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ay === 6 && ax === al[al.length - 1])) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  set(8, size - 8, true);

  // format info (placeholder now, real bits per mask below) and version info (v7+)
  const drawFormat = (mask: number) => {
    const data = (0b00 << 3) | mask; // level M = 00
    const bits = ((data << 10) | bch(data << 10, 0x537, 10)) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  };
  drawFormat(0);
  if (v >= 7) {
    const bits = (v << 12) | bch(v << 12, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // data: two-column zigzag from the bottom right, skipping the vertical timing column; remainder bits stay light
  const cw = codewords(bytes, v);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (fn[y][x] || k >= cw.length * 8) continue;
        mod[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1;
        k++;
      }
    }
  }

  // try every mask, keep the lowest penalty (first wins a tie)
  const apply = (mask: number) => {
    const f = MASKS[mask];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && f(x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    apply(mask); drawFormat(mask);
    const s = penalty(mod);
    if (s < bestScore) { bestScore = s; best = mask; }
    apply(mask); // XOR again to undo
  }
  apply(best); drawFormat(best);
  return mod;
}

/** colours go into an attribute: only currentColor / transparent / none / #hex / var(--x[, fallback]) / rgb[a](…) */
const COLOR_OK = /^(currentColor|transparent|none|#[0-9a-fA-F]{3,8}|var\(--[\w-]+(\s*,\s*[#\w\s(),.%-]*)?\)|rgba?\([\d\s.,%/]+\))$/;
function color(c: string, what: string): string {
  const s = c.trim();
  if (!COLOR_OK.test(s)) throw new Error(`qr: ${what} colour ${JSON.stringify(c)} not allowed (currentColor, transparent, #hex, var(--…), rgb(…))`);
  return s;
}

/** a complete standalone <svg> string (viewBox in modules, shape-rendering crispEdges, one <path> for the dark modules), quiet zone `margin` modules (default 4) */
export function qrSvg(text: string, opts: { dark?: string; light?: string; margin?: number } = {}): string {
  const m = qrMatrix(text);
  const dark = color(opts.dark ?? "currentColor", "dark");
  const light = color(opts.light ?? "transparent", "light");
  const margin = Math.max(0, Math.floor(opts.margin ?? 4));
  const full = m.length + 2 * margin;
  let d = "";
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  const bg = light === "transparent" || light === "none" ? "" : `<rect width="${full}" height="${full}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges">`
    + `${bg}<path fill="${dark}" d="${d}"/></svg>`;
}
