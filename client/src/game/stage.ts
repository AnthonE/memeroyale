// gameplay-stage — staging for the gameplay view cameras (hud, storm-wall, storm-aerial, storm-inside).
// Registered in client/src/world/registry.ts. Builds nothing on its own;
// the view's `stage` hint creates the storm visual / HUD sample / viewmodel for that shot only.
import type { WorldModule } from "../world/module";
import type { CamSpec } from "../engine/views";
import type { WorldCtx } from "../engine/engine";
import * as THREE from "three";
import { POIS } from "../../../shared/world/map";

const V = (pos: CamSpec["pos"], target: CamSpec["target"], o: Partial<CamSpec> = {}): CamSpec => ({ pos, target, fov: 50, ...o });

/** camera specs the storm module may refine by exporting `views` from ./storm/stage (same ids win) */
const OWN_VIEWS: Record<string, CamSpec> = {
  // the east-coast beach north of The Murk:
  // cream sand, turquoise sea on the left, palms framing the right, the BANANA CO. blimp over the bay
  "ui-01-hud": V([818, 1.7, -292], [880, 7, -150], { fov: 75, rel: true, stage: "hud" }),
  "storm-01-wall": V([150, 2, 470], [0, 30, 300], { fov: 65, rel: true, stage: "storm-wall" }),
  "storm-02-aerial": V([0, 2000, 1500], [0, 0, -100], { fov: 45, stage: "storm-aerial" }),
  "storm-03-inside": V([170, 1.6, -250], [120, 8, -120], { fov: 80, rel: true, stage: "storm-inside" }),
  // the title / lobby screen (the game's own title camera: the lobby islet's north beach, the island across the lagoon)
  "ui-03-title": V([64, 1.35, 963], [-170, 40, 400], { fov: 50, rel: true, stage: "title" }),
  // the full-screen map (M) over the flight: painted island, storm, next circle, flight path, drop pin
  "ui-02-map-screen": V([0, 900, 900], [0, 0, 0], { fov: 50, stage: "hud-map" }),
  // the loading screen (index.html #kr-loading, kept in a frozen mid-load state for ?view=ui-04-loading). It covers the
  // whole frame; the camera behind it is the title camera so nothing under the world can ever show through a fade.
  "ui-04-loading": V([64, 1.35, 963], [-170, 40, 400], { fov: 50, rel: true, stage: "loading" }),
};

async function viewModel(ctx: WorldCtx, weapon: "ar" | "pistol" = "ar") {
  const { createWeaponsKit } = await import("../weapons/index");
  const kit = createWeaponsKit(ctx);
  const vm = await kit.createViewModel();
  vm.equip(weapon, "epic");
  ctx.camera.add(vm.object);
  ctx.onUpdate((dt) => vm.update(dt, { speed: 0, grounded: true, sprint: false, crouch: false, lookDX: 0, lookDY: 0 }));
  return vm;
}

const mod: WorldModule = {
  id: "gameplay-stage",
  views: OWN_VIEWS,
  async build() {
    try {
      const s = await import("./storm/stage");
      Object.assign(OWN_VIEWS, s.views ?? {});
    } catch { /* storm stage not built yet */ }
  },
  async stage(ctx, stage) {
    if (stage.startsWith("storm-wall") || stage === "storm-aerial" || stage === "storm-inside" || stage.startsWith("storm-probe:")) {
      const s = await import("./storm/stage");
      const storm = await s.stageStorm(ctx, stage);
      ctx.onUpdate((dt, t) => storm.update(dt, t, ctx.camera));
      if (stage === "storm-inside") await viewModel(ctx, "pistol");
    }
    if (stage === "title") {
      // the menu column + a hero kong on the sand, right third (the live game builds the same in game/index.ts)
      const { createLobby } = await import("../ui/lobby");
      const noop = () => { /* view-camera frame */ };
      const lobby = createLobby({ setName: noop, create: noop, join: noop, setMode: noop, start: noop, practice: noop, range: noop, leave: noop });
      document.getElementById("ui")!.appendChild(lobby.el);
      lobby.update({ code: null, inviteUrl: null, mode: "solo", players: [], meId: 0, isHost: false, busy: false, error: null, offline: false, capacity: 50, invite: null });
      // the live game's own title backdrop (./title.ts): hero kong, plane pass, gliders — the view == the game
      const [{ createKong }, { createPlane }, { createGlider }, { createTitleScene }] = await Promise.all([import("../actors/kong"), import("../actors/plane"), import("../actors/glider"), import("./title")]);
      const eng = ctx as unknown as import("../engine/engine").Engine;
      const plane = await createPlane(eng); ctx.scene.add(plane.object);
      const title = createTitleScene(eng, plane, { createKong: (c, o) => createKong(c, o), createGlider: (c) => createGlider(c) });
      ctx.onUpdate((dt, t) => title.update(dt, t));
    }
    if (stage === "hud" || stage === "hud-map") {
      if (stage === "hud") {
        await viewModel(ctx);
        // the BANANA CO. blimp over the lagoon (upper centre-right), the same model that flies in matches
        const { createBlimp } = await import("./blimp");
        const b = createBlimp(); ctx.scene.add(b.object);
        const f = ctx.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), r = new THREE.Vector3(-f.z, 0, f.x);
        const p = ctx.camera.position.clone().addScaledVector(f, 125).addScaledVector(r, 18);
        b.park(p.x, ctx.camera.position.y + 38, p.z, Math.atan2(f.x, f.z) + 0.35);
        ctx.onUpdate((dt, t) => b.update(dt, t));
      }
      const ui = await import("../ui/hud");
      const sample = await import("../ui/sample");
      const hud = ui.createHud(ctx.terrain, POIS);
      document.getElementById("ui")!.appendChild(hud.el);
      const st = sample.sampleHudState(ctx.terrain, stage === "hud-map");
      if (stage === "hud") {
        // compass + minimap follow the real view camera (heading, position)
        const f = ctx.camera.getWorldDirection(new THREE.Vector3());
        st.yaw = Math.atan2(-f.x, -f.z); st.me.x = ctx.camera.position.x; st.me.z = ctx.camera.position.z;
        if (st.next) { st.next.cx = st.me.x - 8; st.next.cz = st.me.z - 48; }
      }
      hud.setVisible(true);
      if (stage === "hud-map") hud.setMapOpen(true);
      ctx.onUpdate((dt) => hud.update(st, dt));
    }
  },
};
export default mod;
