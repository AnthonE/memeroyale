#!/usr/bin/env node
// Bake the lobby islet's procedurally painted atlases (atlas.ts paintSheets) into GPU-compressed KTX2 files:
//   node client/src/world/pois/lobby-islet/bake-atlas.mjs
// Needs the dev server on :5317 (tools/shot.mjs starts it) and basisu (brew install basis_universal).
// Colour + ORM = ETC1S (small download, ~1 B/px on the GPU), normals = UASTC + zstd at half resolution.
// Output: public/assets/actors/lobby/lobby-<ATLAS_BAKE>-<sheet>-<color|normal|orm>.ktx2 (flipped to texture
// orientation: compressed textures cannot be flipY'd at upload). Bump ATLAS_BAKE in atlas.ts when a painter changes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const out = path.join(root, "public/assets/actors/lobby");
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lobby-atlas-"));

const b = await chromium.launch({ executablePath: process.env.KR_CHROME || new URL("../../../../../tools/lib/chromium-slot.sh", import.meta.url).pathname, timeout: 0,  args: ["--use-angle=vulkan", "--enable-features=Vulkan", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.goto("http://localhost:5317/gallery.html");
const { ver, pngs } = await p.evaluate(async () => {
  const m = await import("/client/src/world/pois/lobby-islet/atlas.ts");
  return { ver: m.ATLAS_BAKE, pngs: m.bakeSheetPNGs() };
});
await b.close();

// old bakes of other versions are removed
for (const f of fs.readdirSync(out)) if (/^lobby-v\d+-/.test(f) && !f.startsWith(`lobby-${ver}-`)) fs.rmSync(path.join(out, f));

let total = 0;
for (const [key, url] of Object.entries(pngs)) {
  const [sheet, kind] = key.split("-");
  const buf = Buffer.from(url.split(",")[1], "base64");
  const meta = await sharp(buf).metadata();
  const half = kind === "normal" && meta.width >= 1024;
  const src = path.join(tmp, `${key}.png`);
  let img = sharp(buf).flip();                                 // canvas rows (top first) → texture rows (v = 0 first)
  if (half) img = img.resize(meta.width / 2, meta.height / 2, { kernel: "lanczos3" });
  await img.png().toFile(src);
  const dst = path.join(out, `lobby-${ver}-${sheet}-${kind}.ktx2`);
  const args = ["-ktx2", "-mipmap", "-output_file", dst];
  if (kind === "normal") args.push("-uastc", "-uastc_level", "2", "-uastc_rdo_l", "1.0", "-normal_map");
  else args.push("-comp_level", "2", "-q", kind === "color" ? "230" : "180");
  if (kind === "orm") args.push("-linear");
  execFileSync("basisu", [...args, src], { stdio: "ignore" });
  const n = fs.statSync(dst).size; total += n;
  console.log(`${path.basename(dst)}  ${(n / 1024).toFixed(0)} KB${half ? " (half-res)" : ""}`);
}
console.log(`total ${(total / 1048576).toFixed(2)} MB → ${path.relative(root, out)}`);
fs.rmSync(tmp, { recursive: true, force: true });
