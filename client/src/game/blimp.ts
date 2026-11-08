// The BANANA CO. blimp (a banana-shaped airship drifting over the lagoon). Gameplay dressing: it floats
// over the island in the title, the warm-up and the match (purely visual, the same slow loop on every client — no
// collider, no network), and the ui-01-hud view parks it over Stilt Town's lagoon. Procedural: a curved,
// five-sided banana hull (canvas-painted skin: ripe yellow, ridge lines, sugar spots, the brown stem + tip, BANANA CO.
// lettering on both flanks), a gondola with lit windows and two prop engines, three tail fins.
import * as THREE from "three";

export interface Blimp {
  readonly object: THREE.Group;
  /** park at a fixed spot (view cameras) */
  park(x: number, y: number, z: number, yaw: number): void;
  update(dt: number, t: number): void;
}

function paintSkin(): THREE.CanvasTexture {
  const W = 2048, H = 1024;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  // around the hull (v): top is the sunlit ridge, bottom the belly; along it (u): stem → tip
  const gv = g.createLinearGradient(0, 0, 0, H);
  gv.addColorStop(0, "#f6c21a"); gv.addColorStop(0.25, "#ffe052"); gv.addColorStop(0.5, "#f4c019"); gv.addColorStop(0.75, "#ffdc48"); gv.addColorStop(1, "#f6c21a");
  g.fillStyle = gv; g.fillRect(0, 0, W, H);
  // green-yellow blush toward the stem, ripe darkening toward the tip
  const gu = g.createLinearGradient(0, 0, W, 0);
  gu.addColorStop(0, "rgba(120,150,20,0.55)"); gu.addColorStop(0.12, "rgba(160,170,30,0.18)"); gu.addColorStop(0.2, "rgba(0,0,0,0)");
  gu.addColorStop(0.85, "rgba(0,0,0,0)"); gu.addColorStop(0.95, "rgba(150,90,10,0.35)"); gu.addColorStop(1, "rgba(60,36,8,0.9)");
  g.fillStyle = gu; g.fillRect(0, 0, W, H);
  // the five ridges (the hull's pentagon edges run along its length)
  for (let k = 0; k < 5; k++) {
    const y = (k / 5) * H;
    const gr = g.createLinearGradient(0, y - 18, 0, y + 18);
    gr.addColorStop(0, "rgba(190,120,10,0)"); gr.addColorStop(0.5, "rgba(190,120,10,0.45)"); gr.addColorStop(1, "rgba(190,120,10,0)");
    g.fillStyle = gr; g.fillRect(0, y - 18, W, 36);
  }
  // sugar spots (few, soft, deterministic)
  let s = 1234567; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0), ((s >>> 8) & 0xffff) / 65536);
  for (let i = 0; i < 90; i++) {
    const x = W * (0.15 + rnd() * 0.75), y = rnd() * H, r = 4 + rnd() * 12;
    const sp = g.createRadialGradient(x, y, 0, x, y, r);
    sp.addColorStop(0, "rgba(96,58,12,0.75)"); sp.addColorStop(1, "rgba(96,58,12,0)");
    g.fillStyle = sp; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); g.fill();
  }
  // BANANA CO. on both flanks (v = 0.25 and 0.75), reading stem → tip
  for (const vy of [0.3, 0.7]) {
    g.save(); g.translate(W * 0.5, H * vy);
    if (vy > 0.5) g.scale(-1, 1);
    g.font = "900 150px 'KR Block', 'Arial Black', Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 16; g.strokeStyle = "#3a2204"; g.lineJoin = "round"; g.strokeText("THE FEED", 0, 0);
    g.fillStyle = "#c7261c"; g.fillText("THE FEED", 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** banana hull: an arc of `len` metres bending up at both ends, five-sided cross-section with rounded ridges */
function hullGeometry(len: number, rMax: number): THREE.BufferGeometry {
  const N = 120, M = 64, bend = 0.9;                  // bend: total arc angle (rad)
  const R = len / bend;                               // arc radius
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = -bend / 2 + bend * t;
    // centre line: arc centred above the hull (the banana smiles: ends curve up)
    const cx = Math.sin(a) * R, cy = R - Math.cos(a) * R;
    const tx = Math.cos(a), ty = Math.sin(a);        // tangent
    const nx = -ty, ny = tx;                          // in-plane normal (up-ish)
    // radius profile: fat middle, a blunt tip (t = 1) and a narrow neck into the stem (t = 0)
    const body = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.02) / 0.96))), 0.62);
    const r = rMax * Math.max(0.06, body) * (t < 0.12 ? 0.55 + 0.45 * (t / 0.12) : 1);
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      const k = 1 + 0.045 * Math.cos(5 * th);          // five soft ridges
      const ox = Math.cos(th) * r * k, oz = Math.sin(th) * r * k;
      pos.push(cx + nx * ox, cy + ny * ox, oz);
      uv.push(t, j / M);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.translate(0, -len * 0.05, 0);
  return g;
}

export function createBlimp(): Blimp {
  const object = new THREE.Group(); object.name = "blimp";
  const LEN = 42, RMAX = 5.6;
  const skin = paintSkin();
  const hullMat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.42, metalness: 0.0 });
  const hull = new THREE.Mesh(hullGeometry(LEN, RMAX), hullMat);
  hull.position.x = -LEN * 0.0; hull.castShadow = true;
  object.add(hull);
  const brown = new THREE.MeshStandardMaterial({ color: 0x4a2c0c, roughness: 0.8 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x6b6a1c, roughness: 0.7 });
  // stem (−X end) and the dark tip (+X end), following the arc's end tangents
  const bend = 0.9, R = LEN / bend;
  const endAt = (s: number) => { const a = s * bend / 2; return { x: Math.sin(a) * R, y: R - Math.cos(a) * R - LEN * 0.05, a }; };
  { const e = endAt(-1); const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 5.5, 12), olive); stem.rotation.z = Math.PI / 2 + e.a; stem.position.set(e.x - Math.cos(e.a) * 2.2, e.y - Math.sin(e.a) * 2.2, 0); object.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8), brown); cap.position.set(e.x - Math.cos(e.a) * 4.9, e.y - Math.sin(e.a) * 4.9, 0); object.add(cap); }
  { const e = endAt(1); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), brown); tip.position.set(e.x, e.y, 0); object.add(tip); }
  // tail fins (near the stem end): three swept fins
  const finMat = new THREE.MeshStandardMaterial({ color: 0xc7261c, roughness: 0.55 });
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(6.5, 0); finShape.lineTo(2.2, 5.2); finShape.lineTo(0, 5.2); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.175);
  { const e = endAt(-0.72);
    for (const [rx, sc] of [[0, 1], [Math.PI * 0.62, 0.8], [-Math.PI * 0.62, 0.8]] as Array<[number, number]>) {
      const f = new THREE.Mesh(finGeo, finMat); f.scale.setScalar(sc);
      f.position.set(e.x, e.y, 0); f.rotation.set(rx, 0, e.a, "XYZ"); f.translateY(RMAX * 0.55); f.castShadow = true; object.add(f);
    } }
  // gondola under the middle: a rounded red car, a band of warm windows, two engines with props
  const gond = new THREE.Group(); gond.position.set(1.5, -RMAX - 1.9, 0); object.add(gond);
  const carMat = new THREE.MeshStandardMaterial({ color: 0xb8231a, roughness: 0.5 });
  const car = new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 7.5, 6, 16), carMat); car.rotation.z = Math.PI / 2; car.castShadow = true; gond.add(car);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.15, metalness: 0.2, emissive: new THREE.Color(1.0, 0.72, 0.35), emissiveIntensity: 0.35 });
  const win = new THREE.Mesh(new THREE.CylinderGeometry(1.39, 1.39, 6.2, 20, 1, true, -0.55, 1.1), winMat); win.rotation.z = Math.PI / 2; win.rotation.x = Math.PI / 2; gond.add(win);
  const win2 = win.clone(); win2.rotation.x = -Math.PI / 2; gond.add(win2);
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.4 });
  const props: THREE.Mesh[] = [];
  for (const sz of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.8, 4, 12), strutMat); pod.rotation.z = Math.PI / 2; pod.position.set(0.5, 0.4, sz * 2.6); gond.add(pod);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.4), strutMat); arm.position.set(0.5, 0.4, sz * 1.8); gond.add(arm);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.28), strutMat); prop.position.set(-1.0, 0.4, sz * 2.6); gond.add(prop); props.push(prop);
  }
  // hangers: four thin cables from the car to the hull
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x3b3326, roughness: 0.9 });
  for (const [x, z] of [[-3, 1], [-3, -1], [3.5, 1], [3.5, -1]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), cableMat); c.position.set(x + 1.5, -RMAX - 0.6, z * 0.9); object.add(c);
  }
  object.traverse((o) => { (o as THREE.Mesh).receiveShadow = false; });
  object.userData.castShadow = true;

  let parked: { x: number; y: number; z: number; yaw: number } | null = null;
  return {
    object,
    park(x, y, z, yaw) { parked = { x, y, z, yaw }; object.position.set(x, y, z); object.rotation.set(0, yaw, 0.03); },
    update(dt, t) {
      for (const p of props) p.rotation.x += dt * 30;
      if (parked) { object.position.y = parked.y + Math.sin(t * 0.5) * 0.6; object.rotation.z = 0.03 + Math.sin(t * 0.35) * 0.015; return; }
      // a slow loop over the island (radius 520 m round the middle, 150 m up, one lap per ~9 minutes); the hull's +X
      // (tip) leads
      const w = (Math.PI * 2) / 540, a = t * w;
      const cx = 30, cz = -120, r = 520;
      object.position.set(cx + Math.cos(a) * r, 150 + Math.sin(t * 0.4) * 2, cz + Math.sin(a) * r);
      object.rotation.set(0, -a - Math.PI / 2, 0.02 + Math.sin(t * 0.3) * 0.02);
    },
  };
}
