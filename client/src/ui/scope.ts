// LONGSTEM sniper scope overlay — the only zoom in the game. Painted once per resize: everything outside the lens
// is black, the lens sits in a split-coconut shell (fibrous husk, cream coconut-flesh inner rim), with a subtle
// chromatic fringe, lens vignette, glass glint and a clean duplex mil-dot reticle without ballistic compensation marks.
export function paintScope(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const W = c.width, H = c.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = H * 0.43;
  const shellR = R * 1.2;
  // outside: pure black, with a faint warm falloff so the shell edge does not look cut out
  g.fillStyle = "#020201";
  g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, shellR, 0, Math.PI * 2, true); g.fill();
  // ---- coconut husk ring
  const husk = g.createRadialGradient(cx, cy, R, cx, cy, shellR);
  husk.addColorStop(0, "#2a160a");
  husk.addColorStop(0.12, "#5a341a");
  husk.addColorStop(0.42, "#6e4322");
  husk.addColorStop(0.8, "#3c2210");
  husk.addColorStop(1, "#050302");
  g.fillStyle = husk;
  g.beginPath(); g.arc(cx, cy, shellR, 0, Math.PI * 2); g.arc(cx, cy, R, 0, Math.PI * 2, true); g.fill();
  // fibres: short tangential strands in tan / dark brown
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.lineCap = "round";
  const N = 2600;
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, rr = R * (1.03 + rnd() * 0.16);
    const len = H * (0.006 + rnd() * 0.02), da = len / rr;
    const light = rnd();
    g.strokeStyle = light > 0.72 ? `rgba(196,150,96,${0.25 + rnd() * 0.3})` : `rgba(24,12,4,${0.3 + rnd() * 0.35})`;
    g.lineWidth = H * (0.0008 + rnd() * 0.0012);
    g.beginPath(); g.arc(cx, cy, rr, a, a + da * (rnd() > 0.5 ? 1 : -1)); g.stroke();
  }
  // key light on the upper-left of the husk, shade lower-right
  const kl = g.createLinearGradient(cx - shellR, cy - shellR, cx + shellR, cy + shellR);
  kl.addColorStop(0, "rgba(255,210,150,0.16)");
  kl.addColorStop(0.5, "rgba(0,0,0,0)");
  kl.addColorStop(1, "rgba(0,0,0,0.4)");
  g.fillStyle = kl;
  g.beginPath(); g.arc(cx, cy, shellR, 0, Math.PI * 2); g.arc(cx, cy, R, 0, Math.PI * 2, true); g.fill();
  // cream coconut-flesh inner rim + dark lip
  g.lineWidth = R * 0.03;
  const flesh = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  flesh.addColorStop(0, "#fff8e4"); flesh.addColorStop(0.55, "#efe2c0"); flesh.addColorStop(1, "#b9a882");
  g.strokeStyle = flesh;
  g.beginPath(); g.arc(cx, cy, R * 1.017, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.008;
  g.strokeStyle = "rgba(20,10,4,0.9)";
  g.beginPath(); g.arc(cx, cy, R * 1.001, 0, Math.PI * 2); g.stroke();

  // ---- lens: vignette, chroma fringe, glint
  const vig = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.8, "rgba(0,4,8,0.18)");
  vig.addColorStop(1, "rgba(0,4,8,0.72)");
  g.fillStyle = vig;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.lineWidth = R * 0.012;
  g.strokeStyle = "rgba(255,40,60,0.22)";
  g.beginPath(); g.arc(cx - R * 0.004, cy, R * 0.985, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(40,210,255,0.20)";
  g.beginPath(); g.arc(cx + R * 0.004, cy, R * 0.972, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.05;
  g.strokeStyle = "rgba(255,255,255,0.05)";
  g.beginPath(); g.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
  g.lineWidth = R * 0.012;
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.beginPath(); g.arc(cx, cy, R * 0.9, Math.PI * 1.12, Math.PI * 1.36); g.stroke();

  // ---- reticle (duplex + mil-dots)
  const ink = "rgba(6,8,6,0.94)";
  const thin = Math.max(1.2, H * 0.0011), thick = Math.max(4, H * 0.0042);
  const inner = R * 0.52;
  g.strokeStyle = ink;
  g.lineCap = "butt";
  g.lineWidth = thin;
  g.beginPath();
  g.moveTo(cx - inner, cy); g.lineTo(cx - R * 0.012, cy);
  g.moveTo(cx + R * 0.012, cy); g.lineTo(cx + inner, cy);
  g.moveTo(cx, cy - inner); g.lineTo(cx, cy - R * 0.012);
  g.moveTo(cx, cy + R * 0.012); g.lineTo(cx, cy + inner);
  g.stroke();
  g.lineWidth = thick;
  g.beginPath();
  g.moveTo(cx - R, cy); g.lineTo(cx - inner, cy);
  g.moveTo(cx + inner, cy); g.lineTo(cx + R, cy);
  g.moveTo(cx, cy + inner); g.lineTo(cx, cy + R);
  g.moveTo(cx, cy - R); g.lineTo(cx, cy - inner);
  g.stroke();
  const mil = inner / 5;
  g.fillStyle = ink;
  for (let i = 1; i <= 4; i++) {
    for (const [x, y] of [[cx + i * mil, cy], [cx - i * mil, cy], [cx, cy - i * mil], [cx, cy + i * mil]]) { g.beginPath(); g.arc(x, y, Math.max(1.6, H * 0.0017), 0, Math.PI * 2); g.fill(); }
  }
  // red centre dot with a dark ring
  g.fillStyle = "rgba(0,0,0,0.7)";
  g.beginPath(); g.arc(cx, cy, Math.max(2.4, H * 0.0024), 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ff2a1a";
  g.beginPath(); g.arc(cx, cy, Math.max(1.6, H * 0.0016), 0, Math.PI * 2); g.fill();
}
