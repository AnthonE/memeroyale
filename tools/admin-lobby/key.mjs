#!/usr/bin/env node
// The admin key for the admin lobby. It NEVER prints the key.
//   node tools/admin-lobby/key.mjs            create .admin-key (chmod 600, git-excluded) if it doesn't exist yet
//   node tools/admin-lobby/key.mjs --hash     print sha256(normalised key) — the value for KR_ADMIN_KEY_SHA256
//   node tools/admin-lobby/key.mjs --rotate   replace the key (every admin session ends at the next server restart)
// The key: 30 characters from a 32-letter alphabet (150 bits), grouped XXXXX-XXXXX-… for reading off the file. The
// server compares sha256 of the NORMALISED form (upper case, letters + digits only), so dashes / spaces / case don't
// matter when it's typed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = process.env.KR_ADMIN_KEY_FILE || path.join(root, ".admin-key");
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const normAdminKey = (k) => k.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");

function make() {
  let s = "";
  for (let i = 0; i < 30; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return s.match(/.{5}/g).join("-");
}
function write(rotate) {
  if (fs.existsSync(file) && !rotate) { console.log(`${path.relative(root, file)} already exists (not touched)`); return; }
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, make() + "\n", { mode: 0o600, flag: "w" });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
  console.log(`wrote a new admin key to ${file} (mode 600). Read it yourself; it is never printed.`);
}
if (process.argv.includes("--hash")) {
  const k = normAdminKey(fs.readFileSync(file, "utf8"));
  if (k.length < 20) { console.error("the key file looks wrong"); process.exit(1); }
  process.stdout.write(crypto.createHash("sha256").update(k, "utf8").digest("hex"));
} else write(process.argv.includes("--rotate"));
