// Staging + view cameras for the actors views (firefight, third-person, plane, glider, kong dev views).
// Owned by the actors area. Sub-pieces (plane.ts, glider.ts, firefight-set.ts, kong-dev-views.ts) own their own
// `views` + `stage`; this module merges them. The lobby islet (char-02) is a POI module (world/pois/lobby-islet).
import type { WorldModule } from "../world/module";
import type { WorldCtx } from "../engine/engine";
import * as plane from "./plane";
import * as glider from "./glider";
import * as firefight from "./firefight-set";
import * as kongDev from "./kong-dev-views";
import * as tpSet from "./tp-set";
import * as tpHamlet from "./tp-hamlet";
import * as story from "./story-views";
import * as swimLab from "./swim-lab";
import { pose, hold } from "./kong-dev-views";
export { pose, hold };


const staged = new Set<string>();

const mod: WorldModule = {
  id: "showcase",
  build() {},
  views: {
    ...plane.views,
    ...glider.views,
    ...firefight.views,
    ...kongDev.views,
    ...tpHamlet.views,
    ...tpSet.views,
    ...story.views,
    ...swimLab.views,
  },
  async stage(ctx: WorldCtx, stage: string) {
    if (staged.has(stage)) return; staged.add(stage);
    await plane.stage(ctx, stage);
    await glider.stage(ctx, stage);
    await firefight.stage(ctx, stage);
    await kongDev.stage(ctx, stage);
    await tpSet.stage(ctx, stage);
    await story.stage(ctx, stage);
    await swimLab.stage(ctx, stage);
  },
};
export default mod;
