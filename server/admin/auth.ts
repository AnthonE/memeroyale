// Admin authentication. Everything an admin can do is checked here, on the server:
//   • the key: only sha256(normalised key) lives in the process (KR_ADMIN_KEY_SHA256); a presented key is compared in
//     constant time (both the exact and the normalised form are always hashed and compared:
//     case, spaces and dashes don't matter when it's typed).
//   • brute force: per address (salted hash, never the IP itself) 5 wrong keys → locked 15 min, doubling per lock
//     (≤ 24 h); globally more than 30 wrong keys a minute → every login waits for the minute to pass, EXCEPT from an
//     address that already logged in this run (or KR_ADMIN_ALLOW_IPS). A locked address gets 429 BEFORE its key is
//     looked at (no oracle). A wrong key answers after ~0.4 s.
//   • sessions: 32 random bytes in an HttpOnly + SameSite=Strict cookie (+ Secure behind https); the server keeps only
//     sha256(token) → expiry (12 h, absolute). Logout / expiry drops it and closes its admin sockets.
//   • origin: every admin POST and the admin socket upgrade must come from this site's own origin (CSRF / cross-site
//     websocket hijack); a browser's Sec-Fetch-Site, when sent, must say same-origin.
import { addrKey } from "../addr";
import crypto from "node:crypto";
import type http from "node:http";

const env = process.env;
const sha256 = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest();

// ---- the key
const ADMIN_SHA: Buffer | null = (() => {
  const h = String(env.KR_ADMIN_KEY_SHA256 || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? Buffer.from(h, "hex") : null;
})();
export const adminConfigured = () => !!ADMIN_SHA;
/** a key as typed or pasted: case, spaces, dashes and stray invisible characters don't matter */
export const normAdminKey = (k: string) => k.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function adminKeyOk(key: unknown): boolean {
  if (!ADMIN_SHA || typeof key !== "string" || key.length < 8 || key.length > 256) return false;
  const exact = crypto.timingSafeEqual(sha256(key), ADMIN_SHA), loose = crypto.timingSafeEqual(sha256(normAdminKey(key)), ADMIN_SHA);
  return exact || loose;
}

// ---- addresses: a salted hash, so nothing here (logs, limits) ever holds an IP
const salt = env.KR_IP_SALT || crypto.randomBytes(16).toString("hex");
export const ipHash = (ip: string) => crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 12);

// ---- brute-force limits
const PER_IP_FAILS = 5, PER_IP_WINDOW_MS = 15 * 60_000, LOCK_MS = 15 * 60_000, LOCK_MAX_MS = 24 * 3600_000;
const GLOBAL_FAILS = 30, GLOBAL_WINDOW_MS = 60_000;
const fails = new Map<string, { n: number; first: number; lockUntil: number; locks: number }>();
const globalFails: number[] = [];
/** The global brake must not become a way to lock the REAL admin out during an event: an audience
 *  spraying wrong keys from many addresses would trip it on purpose. Addresses that already logged in with the right
 *  key during this server run, and KR_ADMIN_ALLOW_IPS (comma list of exact addresses), skip the GLOBAL brake — never
 *  their own per-address one. Nobody gets on the first list without the key. */
const trusted = new Set<string>(String(env.KR_ADMIN_ALLOW_IPS || "").split(",").map((s) => s.trim()).filter(Boolean).map((ip) => ipHash(addrKey(ip))));
/** ms until this address (ipHash) may try a key again (0 = now) */
export function loginWait(who: string, now = Date.now()): number {
  const r = fails.get(who);
  const own = r && r.lockUntil > now ? r.lockUntil - now : 0;
  while (globalFails.length && now - globalFails[0] > GLOBAL_WINDOW_MS) globalFails.shift();
  const all = !trusted.has(who) && globalFails.length >= GLOBAL_FAILS ? GLOBAL_WINDOW_MS - (now - globalFails[0]) : 0;
  return Math.max(own, all);
}
export function noteBadKey(who: string, now = Date.now()): { locked: boolean; left: number } {
  globalFails.push(now); if (globalFails.length > 1000) globalFails.splice(0, globalFails.length - 1000);
  let r = fails.get(who);
  if (!r || (now - r.first > PER_IP_WINDOW_MS && r.lockUntil <= now)) { r = { n: 0, first: now, lockUntil: 0, locks: r?.locks ?? 0 }; fails.set(who, r); }
  r.n++;
  if (r.n >= PER_IP_FAILS) { r.locks++; r.lockUntil = now + Math.min(LOCK_MAX_MS, LOCK_MS * 2 ** (r.locks - 1)); r.n = 0; r.first = now; return { locked: true, left: 0 }; }
  return { locked: false, left: PER_IP_FAILS - r.n };
}
export function noteGoodKey(who: string) { fails.delete(who); if (trusted.size < 64) trusted.add(who); }
// forget stale entries (the map can't grow without bound under a spray of addresses)
setInterval(() => { const now = Date.now(); for (const [k, r] of fails) if (r.lockUntil < now && now - r.first > PER_IP_WINDOW_MS) fails.delete(k); }, 60_000).unref();

// ---- sessions
// (KR_ADMIN_SESSION_S: a shorter life for tools/admin-lobby/redteam.mjs' expiry test; ≥ 2 s, ≤ the 12 h default)
const SESSION_MS = Math.min(12 * 3600_000, Math.max(2000, Number(env.KR_ADMIN_SESSION_S) * 1000 || 12 * 3600_000)), MAX_SESSIONS = 16;
export const COOKIE = "kr_admin";
interface Session { exp: number; created: number }
const sessions = new Map<string, Session>();   // sha256(token) hex → session
const tokenId = (tok: string) => crypto.createHash("sha256").update(tok).digest("hex");
const onEnd = new Set<(id: string, why: "expired" | "logout") => void>();
/** called when a session ends (its admin sockets close) */
export const onSessionEnd = (fn: (id: string, why: "expired" | "logout") => void) => { onEnd.add(fn); };
export function newSession(): { token: string; id: string; exp: number } {
  if (sessions.size >= MAX_SESSIONS) {   // the oldest goes
    let oldest: string | null = null, at = Infinity; for (const [k, s] of sessions) if (s.created < at) { at = s.created; oldest = k; }
    if (oldest) endSession(oldest, "expired");
  }
  const token = crypto.randomBytes(32).toString("base64url"), id = tokenId(token), now = Date.now();
  sessions.set(id, { exp: now + SESSION_MS, created: now });
  return { token, id, exp: now + SESSION_MS };
}
/** the live session id for a request's cookie, or null */
export function sessionOf(req: http.IncomingMessage): string | null {
  const tok = cookieOf(req, COOKIE);
  if (!tok || tok.length > 128 || !/^[A-Za-z0-9_-]+$/.test(tok)) return null;
  const id = tokenId(tok);
  return sessionLive(id) ? id : null;
}
export function sessionLive(id: string): boolean {
  const s = sessions.get(id); if (!s) return false;
  if (s.exp <= Date.now()) { endSession(id, "expired"); return false; }
  return true;
}
export const sessionExp = (id: string) => sessions.get(id)?.exp ?? 0;
export function endSession(id: string, why: "expired" | "logout") {
  if (!sessions.delete(id)) return;
  for (const fn of onEnd) { try { fn(id, why); } catch { /* a listener's problem */ } }
}
setInterval(() => { const now = Date.now(); for (const [id, s] of sessions) if (s.exp <= now) endSession(id, "expired"); }, Math.min(30_000, SESSION_MS / 2)).unref();

function cookieOf(req: http.IncomingMessage, k: string) {
  const h = req.headers.cookie; if (!h || h.length > 8192) return "";
  for (const part of h.split(";")) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === k) return part.slice(i + 1).trim(); }
  return "";
}
/** the cookie path: the admin area only (KR_BASE_PATH = the public prefix, e.g. /kong behind nginx) */
const BASE = String(env.KR_BASE_PATH || "").replace(/[^A-Za-z0-9/_-]/g, "").replace(/\/+$/, "");
export const COOKIE_PATH = `${BASE}/admin`;
const TRUST_PROXY = env.KR_TRUST_PROXY === "1";
/** served over https (directly, or behind a proxy that says so) */
export const isHttps = (req: http.IncomingMessage) => env.KR_SECURE_COOKIE === "1" || (req.socket as { encrypted?: boolean }).encrypted === true
  || (TRUST_PROXY && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
export function sessionCookie(req: http.IncomingMessage, token: string, exp: number) {
  return `${COOKIE}=${token}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((exp - Date.now()) / 1000)}${isHttps(req) ? "; Secure" : ""}`;
}
export const clearCookie = (req: http.IncomingMessage) => `${COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;

// ---- origin
const ORIGINS = String(env.KR_ADMIN_ORIGINS || env.KR_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
/** the request comes from a page on this very site (CSRF / cross-site websocket guard) */
export function sameOrigin(req: http.IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return false;
  const origin = req.headers.origin;
  if (typeof origin !== "string" || !origin || origin === "null") return false;
  if (ORIGINS.length) return ORIGINS.includes(origin);
  let u: URL; try { u = new URL(origin); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = String(req.headers.host || "").toLowerCase();
  return !!host && u.host.toLowerCase() === host;
}
