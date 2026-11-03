// The caster's island map (minimap + full-screen tactical): the painted island, the storm (current circle + the next),
// every kong in its team colour (the watched one ringed, the dead as small crosses, kongs in the air as hollow), the live
// fights as pulsing heat rings, the vehicles, the plane line, and the camera's own footprint.
import * as THREE from "three";
import type { PaintedMap } from "../ui/mapimage";
import type { ClientMatch } from "../game/client";
import { PS } from "../../../shared/sim/player";
import type { CasterRig } from "./rig";
import type { CasterState } from "./state";
import { teamLook } from "./teams";

const V = new THREE.Vector3();

/** `zoom`: 0 = the whole island; 1 = minimap (centred on what the camera watches, ~900 m across) */
export function drawCasterMap(c: HTMLCanvasElement, map: PaintedMap, s: CasterState, rig: CasterRig, cm: ClientMatch, zoom: number) {
  const g = c.getContext("2d"); if (!g) return;
  const W = c.width, H = c.height, half = map.half;
  // view window (world units)
  let cx = 0, cz = 0, span = half * 2;
  if (zoom > 0) {
    span = 900;
    const p = rig.target >= 0 ? s.players[rig.target] : null;
    const f = rig.fight >= 0 ? s.fight(rig.fight) : null;
    if (f) { cx = f.x; cz = f.z; } else if (p && p.live) { cx = p.x; cz = p.z; } else { const cam = rig.engine.camera; cx = cam.position.x; cz = cam.position.z; }
    cx = Math.max(-half + span / 2, Math.min(half - span / 2, cx)); cz = Math.max(-half + span / 2, Math.min(half - span / 2, cz));
  }
  const sc = W / span, toX = (x: number) => (x - (cx - span / 2)) * sc, toY = (z: number) => (z - (cz - span / 2)) * sc;
  g.fillStyle = map.seaCss; g.fillRect(0, 0, W, H);
  const k = map.sizePx / (half * 2);
  g.drawImage(map.canvas, (cx - span / 2 + half) * k, (cz - span / 2 + half) * k, span * k, span * k, 0, 0, W, H);
  // storm
  const st = cm.storm as unknown as { phase: number; cx: number; cz: number; r: number; tx: number; tz: number; tr: number };
  if (st.phase > 0 && cm.phase >= 1 && st.r < 4000) {
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.arc(toX(st.cx), toY(st.cz), st.r * sc, 0, Math.PI * 2, true);
    g.fillStyle = "rgba(120,40,170,.33)"; g.fill("evenodd");
    g.lineWidth = Math.max(2, W / 300); g.strokeStyle = "#c58bff"; g.beginPath(); g.arc(toX(st.cx), toY(st.cz), st.r * sc, 0, Math.PI * 2); g.stroke();
    if (st.tr < st.r - 1) { g.setLineDash([W / 90, W / 120]); g.strokeStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(toX(st.tx), toY(st.tz), st.tr * sc, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    g.restore();
  }
  // the plane line (warm-up / plane)
  if (cm.phase === 1) {
    g.save(); g.strokeStyle = "rgba(255,212,0,.7)"; g.lineWidth = Math.max(2, W / 360); g.setLineDash([W / 60, W / 90]);
    g.beginPath(); g.moveTo(toX(cm.plane.x0), toY(cm.plane.z0)); g.lineTo(toX(cm.plane.x1), toY(cm.plane.z1)); g.stroke(); g.restore();
  }
  // fights
  const t = performance.now() / 1000;
  for (const f of s.fights) {
    const r = Math.max(f.r + 25, 40) * sc, pulse = 0.5 + 0.5 * Math.sin(t * 6 + f.id);
    const grad = g.createRadialGradient(toX(f.x), toY(f.z), 0, toX(f.x), toY(f.z), r * (1.1 + 0.2 * pulse));
    grad.addColorStop(0, `rgba(255,90,50,${0.25 + 0.2 * pulse})`); grad.addColorStop(1, "rgba(255,90,50,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(toX(f.x), toY(f.z), r * 1.3, 0, Math.PI * 2); g.fill();
    if (f.id === rig.fight) { g.strokeStyle = "#ffd400"; g.lineWidth = Math.max(2, W / 280); g.beginPath(); g.arc(toX(f.x), toY(f.z), r, 0, Math.PI * 2); g.stroke(); }
  }
  // vehicles
  for (const v of cm.vehicles) {
    if (!v.live || v.n === 0) continue;
    const x = toX(v.x), y = toY(v.z); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
    g.fillStyle = v.kind === 1 ? "#e8f4ff" : "#ffd98a"; g.strokeStyle = "#111"; g.lineWidth = 1.5;
    g.beginPath(); g.rect(x - W / 260, y - W / 260, W / 130, W / 130); g.fill(); g.stroke();
  }
  // kongs
  const dot = Math.max(3.2, W / (zoom > 0 ? 70 : 150));
  for (const p of s.players) {
    if (!p.live || p.inPlane || p.st === PS.Plane) continue;
    const x = toX(p.x), y = toY(p.z); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
    const col = teamLook(p.team).color;
    if (!p.alive) { g.strokeStyle = col; g.lineWidth = dot * 0.4; g.beginPath(); g.moveTo(x - dot * 0.6, y - dot * 0.6); g.lineTo(x + dot * 0.6, y + dot * 0.6); g.moveTo(x + dot * 0.6, y - dot * 0.6); g.lineTo(x - dot * 0.6, y + dot * 0.6); g.stroke(); continue; }
    const air = p.st === PS.Freefall || p.st === PS.Glide;
    // facing tick
    g.strokeStyle = col; g.lineWidth = dot * 0.35; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.sin(p.yaw) * dot * 2, y - Math.cos(p.yaw) * dot * 2); g.stroke();
    g.beginPath(); g.arc(x, y, dot, 0, Math.PI * 2);
    if (air) { g.lineWidth = dot * 0.45; g.stroke(); } else { g.fillStyle = col; g.fill(); g.lineWidth = Math.max(1, dot * 0.3); g.strokeStyle = "rgba(0,0,0,.75)"; g.stroke(); }
    if (p.id === rig.target) { g.strokeStyle = "#fff"; g.lineWidth = dot * 0.4; g.beginPath(); g.arc(x, y, dot * 2.1, 0, Math.PI * 2); g.stroke(); }
    if (zoom === 0 && (p.id === rig.target || p.kills >= 3)) { g.font = `800 ${Math.round(dot * 2.6)}px 'Barlow Condensed', sans-serif`; g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.8)"; g.lineWidth = dot * 0.6; g.strokeText(p.name, x + dot * 1.8, y - dot * 1.2); g.fillText(p.name, x + dot * 1.8, y - dot * 1.2); }
  }
  // the camera: position + look direction
  const cam = rig.engine.camera;
  cam.getWorldDirection(V);
  const x = toX(cam.position.x), y = toY(cam.position.z), a = Math.atan2(V.x, V.z), fv = 0.55;
  g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x, y); g.arc(x, y, W * 0.09, Math.PI / 2 - a - fv, Math.PI / 2 - a + fv); g.closePath(); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, dot * 0.7, 0, Math.PI * 2); g.fill();
}
