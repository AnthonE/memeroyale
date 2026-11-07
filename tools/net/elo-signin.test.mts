// Sign in with Elo Pros (server/elo.ts): the pass check against Elo Pros' own signed vector
// (testdata/elo-account-token.json, copied from its sdk/testdata/account_token.json: a test key that signs nothing real),
// the nonces and the tickets. No network.
//   npx tsx tools/net/elo-signin.test.mts
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { Nonces, Tickets, edKey, verifyPass } from "../../server/elo";

const V = JSON.parse(readFileSync(new URL("./testdata/elo-account-token.json", import.meta.url), "utf8"));
const key = edKey(Buffer.from(V.pubkey, "base64"));
const before = V.exp - 60;
let fails = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) fails++; };
const once = (n: string) => n === V.nonce;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

check("a pass with a wallet names the account and the wallet", same(verifyPass(V.with_wallet.pass, key, V.game, [V.shard], once, before), { account: V.account, wallet: V.with_wallet.wallet }));
check("a pass with no wallet names the account alone", same(verifyPass(V.no_wallet.pass, key, V.game, [V.shard], once, before), { account: V.account, wallet: null }));
check("a Solana wallet is kept as base58 spells it", same(verifyPass(V.solana_wallet.pass, key, V.game, [V.shard], once, before), { account: V.account, wallet: V.solana_wallet.wallet }));
check("another game's pass is refused", verifyPass(V.with_wallet.pass, key, "meme-royale", [V.shard], once, before) === "elsewhere");
check("a pass for another site is refused", verifyPass(V.with_wallet.pass, key, V.game, ["meme.example.com"], once, before) === "elsewhere");
check("an expired pass is refused", verifyPass(V.with_wallet.pass, key, V.game, [V.shard], once, V.exp) === "expired");
check("a nonce this server didn't issue is refused", verifyPass(V.with_wallet.pass, key, V.game, [V.shard], () => false, before) === "replayed");
const other = edKey(crypto.generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(12));
check("a pass another key signed is refused", verifyPass(V.with_wallet.pass, other, V.game, [V.shard], once, before) === "signer");
const [body, sig] = V.with_wallet.pass.split(".");
const forged = Buffer.from(V.with_wallet.text.replace(V.with_wallet.wallet, "0x" + "1".repeat(40))).toString("base64url") + "." + sig;
check("a pass with a changed wallet is refused", verifyPass(forged, key, V.game, [V.shard], once, before) === "signer");
check("junk is malformed", ["", "x", "a.b.c", body, `${body}.`, `${body}.!!`, "x".repeat(2000)].every((p) => verifyPass(p, key, V.game, [V.shard], once, before) === "malformed"));

const N = new Nonces(), t = 1_800_000_000, n = N.issue(t);
check("a nonce is 64 lower-case hex", /^[0-9a-f]{64}$/.test(n));
check("a nonce is taken once", N.take(n, t + 1) && !N.take(n, t + 2));
check("a nonce runs out after ten minutes", !N.take(N.issue(t), t + Nonces.TTL_S));
check("a nonce from the future is refused", !N.take(N.issue(t + 60), t));
check("a nonce with a changed byte is refused", !N.take(N.issue(t).replace(/^./, (c) => (c === "0" ? "1" : "0")), t));
const shared = crypto.randomBytes(32), A = new Nonces(shared), B = new Nonces(shared);
check("two servers with one key take each other's nonces", B.take(A.issue(t), t + 1));
check("a server with another key refuses them", !new Nonces().take(A.issue(t), t + 1));

const T = new Tickets(), who = { account: V.account, wallet: V.with_wallet.wallet };
const { ticket } = T.issue(who, t);
check("a ticket names who signed in", same(T.take(ticket, t + 60), who));
check("a ticket runs out after twelve hours", T.take(ticket, t + Tickets.TTL_S) === null);
check("another server's ticket is refused", new Tickets().take(ticket, t + 60) === null);
const [, tb, tm] = ticket.split(".");
const other2 = Buffer.from(JSON.stringify({ a: V.account, w: "0x" + "2".repeat(40), e: t + 999 })).toString("base64url");
check("a ticket with a changed wallet is refused", T.take(`t1.${other2}.${tm}`, t + 60) === null && T.take(`t1.${tb}.${"0".repeat(32)}`, t + 60) === null);
check("junk is not a ticket", [null, 3, "", "t1..", "x".repeat(600)].every((x) => T.take(x, t) === null));

console.log(fails ? `elo sign-in: ${fails} failed` : "elo sign-in: all checks passed");
process.exitCode = fails ? 1 : 0;
