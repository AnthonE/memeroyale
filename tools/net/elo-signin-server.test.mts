// Sign in with Elo Pros through the real server (server/index.ts + server/elo.ts): a throwaway key stands in for Elo
// Pros' (KR_ELO_PUBKEY), so the server checks passes we sign here. GET api/elo, a nonce, POST api/elo/signin with a pass
// for that nonce (and refusals: the same nonce again, another game, junk), then the ticket over a socket ({t: "elo"}).
// Also: with KR_ELO_DOMAINS unset, sign-in is off and says so. No network beyond 127.0.0.1.
//   npx tsx tools/net/elo-signin-server.test.mts
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { WebSocket } from "ws";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((res, rej) => { const s = net.createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const kp = crypto.generateKeyPairSync("ed25519");
const pub = (kp.publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("base64");
const ACCT = "acct_" + "ab".repeat(10), WALLET = "0x" + "12".repeat(20);
const pass = (nonce: string, game = "meme-royale", shard = "127.0.0.1", exp = Math.floor(Date.now() / 1000) + 600) => {
  const text = Buffer.from(`elo account\nid: ${ACCT}\nfor: play:${game}\nshard: ${shard}\nnonce: ${nonce}\nwallet: ${WALLET}\nexp: ${exp}`);
  return text.toString("base64url") + "." + crypto.sign(null, text, kp.privateKey).toString("base64url");
};

let fails = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); if (!ok) fails++; };
async function serve(env: Record<string, string>): Promise<{ port: number; proc: ChildProcess; log: () => string }> {
  const port = await freePort();
  const proc = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { env: { ...process.env, KR_EVENT_MODE: "0", KR_PORT: String(port), KR_HOST: "127.0.0.1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; proc.stdout!.on("data", (d) => { log += d; }); proc.stderr!.on("data", (d) => { log += d; });
  const end = Date.now() + 60_000;
  while (!/MEME ROYALE server on/.test(log)) { if (Date.now() > end) throw new Error("server start:\n" + log); await sleep(50); }
  return { port, proc, log: () => log };
}
const json = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, unknown> });

const procs: ChildProcess[] = [];
try {
  // ---- off: no KR_ELO_DOMAINS
  {
    const s = await serve({ KR_ELO_DOMAINS: "" }); procs.push(s.proc);
    const on = await json(await fetch(`http://127.0.0.1:${s.port}/api/elo`));
    check("off: api/elo says off", on.status === 200 && on.body.on === false, on);
    const n = await fetch(`http://127.0.0.1:${s.port}/api/elo/nonce`);
    check("off: no nonces", n.status === 404, n.status);
  }
  // ---- on
  const s = await serve({ KR_ELO_DOMAINS: "127.0.0.1", KR_ELO_PUBKEY: pub }); procs.push(s.proc);
  const base = `http://127.0.0.1:${s.port}/api/elo`;
  const on = await json(await fetch(base));
  check("on: api/elo names the game", on.body.on === true && on.body.game === "meme-royale", on);
  const nonce = String((await json(await fetch(`${base}/nonce`))).body.nonce);
  check("a nonce is 64 hex", /^[0-9a-f]{64}$/.test(nonce), nonce);
  const post = (p: unknown) => fetch(`${base}/signin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pass: p }) }).then(json);
  const ok = await post(pass(nonce));
  check("a good pass signs in: account, wallet and a ticket", ok.status === 200 && ok.body.ok === true && ok.body.account === ACCT && ok.body.wallet === WALLET && typeof ok.body.ticket === "string", ok);
  const again = await post(pass(nonce));
  check("the same nonce twice is refused", again.status === 401 && again.body.error === "replayed", again);
  const n2 = String((await json(await fetch(`${base}/nonce`))).body.nonce);
  const other = await post(pass(n2, "gates"));
  check("another game's pass is refused", other.status === 401 && other.body.error === "elsewhere", other);
  const site = await post(pass(n2, "meme-royale", "evil.example"));
  check("a pass for another site is refused", site.status === 401 && site.body.error === "elsewhere", site);
  const junk = await post("junk");
  check("junk is refused", junk.status === 401 && junk.body.error === "malformed", junk);
  const big = await fetch(`${base}/signin`, { method: "POST", body: "x".repeat(10_000) }).then((r) => r.status).catch(() => 413);
  check("a big body is refused", big === 413, big);

  // ---- the ticket over a socket
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`), got: Record<string, unknown>[] = [];
  ws.on("message", (d: Buffer, binary: boolean) => { if (!binary) got.push(JSON.parse(String(d))); });
  await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  ws.send(JSON.stringify({ t: "elo", ticket: ok.body.ticket }));
  ws.send(JSON.stringify({ t: "elo", ticket: "t1.forged.00000000000000000000000000000000" }));
  const end = Date.now() + 10_000;
  while (got.filter((m) => m.t === "elo").length < 2 && Date.now() < end) await sleep(20);
  const elo = got.filter((m) => m.t === "elo");
  check("the socket takes the ticket and names the wallet", elo[0]?.ok === true && elo[0]?.wallet === WALLET, elo[0]);
  check("the socket refuses a forged ticket", elo[1]?.ok === false, elo[1]);
  ws.close();
} catch (e) {
  fails++; console.log("FAIL ", e instanceof Error ? e.message : e);
} finally {
  for (const p of procs) p.kill();
}
console.log(fails ? `elo sign-in (server): ${fails} failed` : "elo sign-in (server): all checks passed");
process.exit(fails ? 1 : 0);
