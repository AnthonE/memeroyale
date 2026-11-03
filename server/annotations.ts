// DEV VIEW ANNOTATIONS: /api/annotations, beside /api/kongbot.
//   GET  /api/annotations            → { ok, notes: Note[] } (open + resolved, newest last)
//   POST /api/annotations {text, pos, cam, target, author?}  → { ok, note }   (a new note)
//   POST /api/annotations {op: "resolve" | "reopen" | "delete", id} → { ok }
// Storage: an append-only JSONL log at <root>/.kongbot/annotations/annotations.jsonl (the source of truth, git-ignored);
// every new note is also written to MongoDB collection kongbot_annotations when Mongo is up (best effort, for triage
// next to the kongbot reports). Ops fold in order: a note line, then resolve / reopen / delete lines by id.
// Access: loopback only (the vite dev proxy, a local server) unless KR_ANNOTATE=1 — it is a dev tool, not a public API.
import type http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { MongoClient, type Collection, type Document } from "mongodb";

const URI = process.env.KR_MONGO_URI || "mongodb://127.0.0.1:27017";
const DB = process.env.KR_MONGO_DB || "kong_royale";
const MAX_BODY = 64 * 1024, RATE_N = 120, RATE_WINDOW_MS = 10 * 60_000;

export interface Note {
  id: string; at: string; author: string; text: string; status: "open" | "resolved";
  /** the picked point (world), and the camera that saw it ("go to") */
  pos: [number, number, number]; cam: { x: number; y: number; z: number; yaw: number; pitch: number } | null;
  /** what was under the reticle: mesh / module / POI / material / collider box (free-form, size-capped) */
  target: Record<string, unknown> | null;
  build: string | null;
}

export function annotationsApi(root: string) {
  let sha: { at: number; v: string | null } = { at: 0, v: null };
  const build = () => {
    if (Date.now() - sha.at > 60_000) { let v: string | null = null; try { v = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* no git */ } sha = { at: Date.now(), v }; }
    return sha.v;
  };
  const dir = path.join(root, ".kongbot", "annotations"), file = path.join(dir, "annotations.jsonl");
  const hits = new Map<string, number[]>();
  const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), "[annotations]", ...a);
  let col: Collection<Document> | null = null, client: MongoClient | null = null, lastFail = 0;
  async function mongo(): Promise<Collection<Document> | null> {
    if (col) return col;
    if (Date.now() - lastFail < 30_000) return null;
    const c = new MongoClient(URI, { serverSelectionTimeoutMS: 1500 });
    try { await c.connect(); client = c; col = c.db(DB).collection("kongbot_annotations"); await col.createIndex({ id: 1 }, { unique: true }); log("mongo ready"); return col; }
    catch { lastFail = Date.now(); await c.close().catch(() => {}); return null; }
  }
  function readAll(): Note[] {
    let lines: string[] = [];
    try { lines = fs.readFileSync(file, "utf8").split("\n"); } catch { return []; }
    const byId = new Map<string, Note>();
    for (const l of lines) {
      if (!l.trim()) continue;
      let j: Record<string, unknown>; try { j = JSON.parse(l); } catch { continue; }
      if (j.op === "note" && j.note) { const n = j.note as Note; byId.set(n.id, n); }
      else if (typeof j.id === "string" && byId.has(j.id)) {
        if (j.op === "delete") byId.delete(j.id);
        else if (j.op === "resolve") byId.get(j.id)!.status = "resolved";
        else if (j.op === "reopen") byId.get(j.id)!.status = "open";
      }
    }
    return [...byId.values()];
  }
  function append(o: unknown) { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(file, JSON.stringify(o) + "\n"); }
  function reply(res: http.ServerResponse, code: number, body: unknown) {
    res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body));
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
  /** a JSON value, depth- and size-capped (strings ≤ 300, ≤ 40 keys / items per level) */
  function capped(v: unknown, d = 0): unknown {
    if (v === null || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "string") return v.slice(0, 300);
    if (d > 4 || typeof v !== "object") return null;
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => capped(x, d + 1));
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) o[k.replace(/^\$/, "_").replace(/\./g, "_").slice(0, 40)] = capped(x, d + 1);
    return o;
  }
  async function handle(req: http.IncomingMessage, res: http.ServerResponse, ip: string) {
    const proxied = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "forwarded"].some((h) => req.headers[h] !== undefined);
    const loop = !proxied && /^(::1|127\.|::ffff:127\.)/.test(ip);
    if (!loop && process.env.KR_ANNOTATE !== "1") { reply(res, 403, { ok: false, error: "annotations are a local dev tool (KR_ANNOTATE=1 to open them)" }); return; }
    if (req.method === "GET") { reply(res, 200, { ok: true, notes: readAll() }); return; }
    if (req.method !== "POST") { reply(res, 405, { ok: false, error: "GET or POST" }); return; }
    const now = Date.now(), h = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (h.length >= RATE_N) { reply(res, 429, { ok: false, error: "slow down" }); return; }
    h.push(now); hits.set(ip, h);
    const chunks: Buffer[] = []; let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > MAX_BODY) { reply(res, 413, { ok: false, error: "too large" }); req.destroy(); return; } chunks.push(c as Buffer); }
    let b: Record<string, unknown>;
    try { b = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { reply(res, 400, { ok: false, error: "bad json" }); return; }
    if (!b || typeof b !== "object") { reply(res, 400, { ok: false, error: "bad body" }); return; }
    if (b.op === "resolve" || b.op === "reopen" || b.op === "delete") {
      const id = String(b.id ?? "");
      if (!readAll().some((n) => n.id === id)) { reply(res, 404, { ok: false, error: "no such note" }); return; }
      append({ op: b.op, id, at: new Date().toISOString() });
      void mongo().then((c) => c?.updateOne({ id }, b.op === "delete" ? { $set: { deleted: true } } : { $set: { status: b.op === "resolve" ? "resolved" : "open" } })).catch(() => {});
      reply(res, 200, { ok: true }); return;
    }
    const text = String(b.text ?? "").trim().slice(0, 2000);
    if (text.length < 2) { reply(res, 400, { ok: false, error: "empty note" }); return; }
    const p = Array.isArray(b.pos) ? b.pos : [], c = (b.cam ?? null) as Record<string, unknown> | null;
    const note: Note = {
      id: `AN-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`, at: new Date().toISOString(),
      author: String(b.author ?? "dev").slice(0, 40) || "dev", text, status: "open",
      pos: [num(p[0]), num(p[1]), num(p[2])],
      cam: c ? { x: num(c.x), y: num(c.y), z: num(c.z), yaw: num(c.yaw), pitch: num(c.pitch) } : null,
      target: (capped(b.target ?? null) as Record<string, unknown> | null), build: build(),
    };
    append({ op: "note", note });
    void mongo().then((col) => col?.insertOne({ ...note, createdAt: new Date(note.at) })).catch(() => {});
    log(`${note.id} by ${note.author}: ${text.slice(0, 80)}`);
    reply(res, 200, { ok: true, note });
  }
  return { handle, close: async () => { await client?.close().catch(() => {}); } };
}
