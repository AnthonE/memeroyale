// Sign in with Elo Pros (https://elopros.com, its docs/client/ACCOUNTS.md §6): who a player is, from a pass the page got
// from Elo Pros' popup and handed this server over the socket ({ t: "elo", pass }). Checked offline, never by asking
// Elo Pros per join: a port of oneshot's crates/server/src/auth.rs.
//
// A pass is `b64url(text) "." b64url(ed25519 signature over text)`, signed by Elo Pros' account key
// (GET https://elopros.com/api/account/pubkey). The text is exactly seven lines: `elo account`, `id: acct_…`,
// `for: play:<slug>`, `shard: <the page's host>`, `nonce: <ours, once>`, `wallet: 0x…|base58|none`, `exp: <unix>`.
// The nonce is one this server handed out (GET /api/elo/nonce), so a pass can't be replayed at another join or on
// another site. What a pass gives: the account id and, when one is linked, the wallet. The player keeps their callsign.
//
// Off unless KR_ELO_DOMAINS names the host(s) the page is served on (a pass names the host that asked for it):
//   KR_ELO_DOMAINS   comma-separated hosts, e.g. "meme.example.com" (plain http works only on localhost / 127.0.0.1)
//   KR_ELO_GAME      the listing's slug (default "meme-royale")
//   KR_ELO_PUBKEY    the account key, standard base64 of 32 bytes; unset = fetched once from KR_ELO_ORIGIN at startup
//   KR_ELO_ORIGIN    default https://elopros.com
//   KR_ELO_NONCE_KEY 64 hex: nonces any server holding it takes (two slots behind one name); unset = this process's own
import crypto from "node:crypto";

export interface Passed {
  /** `acct_` and 20 lower-case hex */
  account: string;
  /** a linked wallet: lower-case 0x… or a Solana wallet as base58 spells it; null = none linked */
  wallet: string | null;
}
export type PassError = "malformed" | "signer" | "elsewhere" | "replayed" | "expired";

const hexn = (s: string, n: number) => s.length === n && /^[0-9a-f]+$/.test(s);
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const b64u = (s: string) => /^[A-Za-z0-9_-]+$/.test(s) ? Buffer.from(s, "base64url") : null;

/** an ed25519 public key from its 32 raw bytes */
export function edKey(raw: Buffer): crypto.KeyObject {
  if (raw.length !== 32) throw new Error(`an ed25519 key is 32 bytes, not ${raw.length}`);
  return crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
}

/** checks a pass; `nonceOk` says whether its nonce is one this server issued and hasn't seen used (and takes it) */
export function verifyPass(pass: string, key: crypto.KeyObject, slug: string, domains: readonly string[], nonceOk: (n: string) => boolean, now: number): Passed | PassError {
  if (typeof pass !== "string" || pass.length > 1024) return "malformed";
  const dot = pass.indexOf(".");
  if (dot < 0 || pass.indexOf(".", dot + 1) >= 0) return "malformed";
  const body = b64u(pass.slice(0, dot)), sig = b64u(pass.slice(dot + 1));
  if (!body || !sig) return "malformed";
  if (!crypto.verify(null, body, key, sig)) return "signer";
  const lines = body.toString("utf8").split("\n");
  if (lines.length !== 7 || lines[0] !== "elo account") return "malformed";
  const take = (i: number, name: string) => lines[i].startsWith(name + ": ") ? lines[i].slice(name.length + 2) : null;
  const id = take(1, "id"), game = take(2, "for"), shard = take(3, "shard"), nonce = take(4, "nonce"), w = take(5, "wallet"), exp = take(6, "exp");
  if (id === null || game === null || shard === null || nonce === null || w === null || exp === null) return "malformed";
  if (!id.startsWith("acct_") || !hexn(id.slice(5), 20)) return "malformed";
  let wallet: string | null;
  if (w === "none") wallet = null;
  else if (w.startsWith("0x") && hexn(w.slice(2), 40)) wallet = w;
  else if (!w.startsWith("0x") && SOL.test(w)) wallet = w;
  else return "malformed";
  if (!/^\d{1,12}$/.test(exp)) return "malformed";
  if (game !== `play:${slug}` || !domains.includes(shard)) return "elsewhere";
  if (Number(exp) <= now) return "expired";
  if (!nonceOk(nonce)) return "replayed";
  return { account: id, wallet };
}

/** the nonces this server hands the page, each good once for ten minutes. A nonce carries its own proof: hex(issued
 *  unix seconds, 8 bytes) + hex(8 random bytes), then the first 16 bytes of their HMAC-SHA256 under the key: 64 hex,
 *  inside Elo Pros' [0-9A-Za-z]{8,64}. So it needs no list of what was issued, only of what was taken. */
export class Nonces {
  static readonly TTL_S = 600;
  private static readonly CAP = 100_000;
  private used = new Map<string, number>();
  constructor(private key: Buffer = crypto.randomBytes(32)) {}
  private mac(head: string) { return crypto.createHmac("sha256", this.key).update(head).digest().subarray(0, 16).toString("hex"); }
  issue(now = Math.floor(Date.now() / 1000)): string {
    const t = Buffer.alloc(8); t.writeBigUInt64BE(BigInt(now));
    const head = t.toString("hex") + crypto.randomBytes(8).toString("hex");
    return head + this.mac(head);
  }
  take(n: string, now = Math.floor(Date.now() / 1000)): boolean {
    if (!hexn(n, 64)) return false;
    const head = n.slice(0, 32), mac = Buffer.from(n.slice(32)), want = Buffer.from(this.mac(head));
    if (!crypto.timingSafeEqual(mac, want)) return false;
    const at = Number(BigInt("0x" + head.slice(0, 16)));
    // issued in the window (a little ahead allows two slots' clocks)
    if (at > now + 5 || now - at >= Nonces.TTL_S) return false;
    for (const [k, t] of this.used) if (now - t >= Nonces.TTL_S) this.used.delete(k);
    if (this.used.has(n) || this.used.size >= Nonces.CAP) return false;
    this.used.set(n, at);
    return true;
  }
}

/** after a pass checks out, the page keeps a ticket (12 h) and hands it over on every connection, so a player signs in
 *  once a day, not once a join: "t1." b64url(JSON {a: account, w: wallet, e: exp}) "." the first 16 bytes of its
 *  HMAC-SHA256 under the ticket key, hex. Only this server (or one holding KR_ELO_NONCE_KEY) takes it. */
export class Tickets {
  static readonly TTL_S = 12 * 3600;
  constructor(private key: Buffer = crypto.randomBytes(32)) {}
  private mac(body: string) { return crypto.createHmac("sha256", this.key).update("ticket:" + body).digest().subarray(0, 16).toString("hex"); }
  issue(p: Passed, now = Math.floor(Date.now() / 1000)): { ticket: string; exp: number } {
    const exp = now + Tickets.TTL_S, body = Buffer.from(JSON.stringify({ a: p.account, w: p.wallet, e: exp })).toString("base64url");
    return { ticket: `t1.${body}.${this.mac(body)}`, exp };
  }
  take(t: unknown, now = Math.floor(Date.now() / 1000)): Passed | null {
    if (typeof t !== "string" || t.length > 512) return null;
    const m = /^t1\.([A-Za-z0-9_-]+)\.([0-9a-f]{32})$/.exec(t);
    if (!m || !crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(this.mac(m[1])))) return null;
    try {
      const j = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as { a?: unknown; w?: unknown; e?: unknown };
      if (typeof j.a !== "string" || typeof j.e !== "number" || j.e <= now || (j.w !== null && typeof j.w !== "string")) return null;
      return { account: j.a, wallet: j.w as string | null };
    } catch { return null; }
  }
}

/** the server's sign-in, from the environment (null when KR_ELO_DOMAINS is unset: sign-in is off) */
export interface EloSignIn { game: string; domains: string[]; nonces: Nonces; tickets: Tickets; key: () => crypto.KeyObject | null; check: (pass: unknown) => Passed | PassError | "off" }
export function eloFromEnv(env: NodeJS.ProcessEnv, log: (...a: unknown[]) => void): EloSignIn | null {
  const domains = (env.KR_ELO_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!domains.length) return null;
  const game = env.KR_ELO_GAME || "meme-royale";
  const nk = env.KR_ELO_NONCE_KEY;
  if (nk && !hexn(nk, 64)) throw new Error("KR_ELO_NONCE_KEY must be 64 lower-case hex");
  const nonces = new Nonces(nk ? Buffer.from(nk, "hex") : undefined);
  // the ticket key is derived from the nonce key, so two slots sharing one take each other's tickets too
  const tickets = new Tickets(nk ? crypto.createHash("sha256").update("tickets:" + nk).digest() : undefined);
  let key: crypto.KeyObject | null = null;
  if (env.KR_ELO_PUBKEY) key = edKey(Buffer.from(env.KR_ELO_PUBKEY, "base64"));
  else {
    const origin = env.KR_ELO_ORIGIN || "https://elopros.com";
    const load = (tries: number) => void fetch(`${origin}/api/account/pubkey`).then((r) => r.json()).then((j: { pubkey?: string }) => {
      key = edKey(Buffer.from(String(j.pubkey), "base64")); log(`elo sign-in: account key from ${origin}`);
    }).catch((e) => { log(`elo sign-in: no account key from ${origin} (${e instanceof Error ? e.message : e})${tries ? ", trying again in 60 s" : ""}`); if (tries) setTimeout(() => load(tries - 1), 60_000).unref(); });
    load(30);
  }
  log(`elo sign-in on: play:${game} at ${domains.join(", ")}`);
  return {
    game, domains, nonces, tickets, key: () => key,
    check: (pass) => key ? verifyPass(String(pass ?? ""), key, game, domains, (n) => nonces.take(n), Math.floor(Date.now() / 1000)) : "off",
  };
}
