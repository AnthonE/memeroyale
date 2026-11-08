// The announcer's lines (client/src/audio/announcer.ts plays them): recorded by ElevenLabs in the voice Kallixis, as
// oneshot's announcer was (its tools/voice.mjs: text to dialogue, eleven_v4, stability 0.5), cut like oneshot's
// tools/voice.sh (ends trimmed, mono, -15 LUFS, limited to 0.84) into public/assets/audio/kr/vo/<slug>.ogg (Opus) and
// .m4a (AAC), 48 kHz like the rest of the library, with their entries in public/assets/audio/kr/manifest.json.
//
//   node tools/audio/vo.mjs                        the lines, and which are in the game: nothing made, nothing spent
//   node tools/audio/vo.mjs make <slug>            three takes into .vo-takes/ (git-ignored), each read back by
//                                                  Scribe (the words it heard) and measured (length, loudness)
//   node tools/audio/vo.mjs keep <slug> <n>        take n cut into the game
//   node tools/audio/vo.mjs import <file> <slug>   an existing recording (oneshot's kept lines) cut into the game
//
// The key is ELEVENLABS_API_KEY (or a proxy that adds the xi-api-key header). The lines are owned outright (an
// ElevenLabs paid plan), like oneshot's: public/assets/audio/kr/vo/provenance.json.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VOICE = "cPoqAvGWCPfCfyPMwe4z", MODEL = "eleven_v4", API = "https://api.elevenlabs.io/v1", TAKES = 3;
const TAKES_DIR = ".vo-takes", OUT = "public/assets/audio/kr/vo", MANIFEST = "public/assets/audio/kr/manifest.json";

/** slug → the text as typed (`!!` asks for the shouted ladder read, as oneshot's kept lines were) */
export const LINES = {
  ratioed: "Ratioed!!", main_character: "Main character!!", skill_issue: "Skill issue.", touch_grass: "Touch grass.",
  clout_acquired: "Clout acquired!", brrrt: "Brrrrrt!!", headshot: "Headshot!", long_shot: "Long shot!",
  payback: "Payback!", drop_in_chat: "Drop in, chat!", top_ten: "Top ten.", top_three: "Top three. Stay humble.",
  final_circle: "Final circle!!", feed_closing: "The Feed is closing in.", logged_off: "Logged off.",
};
/** lines kept from oneshot's announcer (crates/client/assets/sound/voice/<file>.ogg), imported as they are */
export const FROM_ONESHOT = ["double_kill", "triple_kill", "overkill", "rampage", "killing_spree", "unstoppable", "game_over_you_win", "game_over_you_lose"];

const key = () => process.env.ELEVENLABS_API_KEY || "proxy-injected";
const ff = (args) => spawnSync("ffmpeg", ["-nostdin", "-hide_banner", ...args], { encoding: "utf8" });

async function record(text) {
  const r = await fetch(`${API}/text-to-dialogue?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify({ inputs: [{ text, voice_id: VOICE }], model_id: MODEL, settings: { stability: 0.5 } }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
async function heard(file) {
  const form = new FormData();
  form.append("model_id", "scribe_v1"); form.append("file", new Blob([readFileSync(file)]), "take.mp3");
  const r = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key() }, body: form });
  return r.ok ? (await r.json()).text : `(${r.status})`;
}

/** EBU R128 of a file: integrated, max momentary, max short-term, true peak (dB), plus sample peak and length */
function measure(file) {
  const r = ff(["-i", file, "-af", "ebur128=peak=true+sample,astats=metadata=0", "-f", "null", "-"]);
  const t = r.stderr;
  let M = -Infinity, S = -Infinity;
  for (const m of t.matchAll(/ M:\s*(-?[\d.]+) S:\s*(-?[\d.]+)/g)) { M = Math.max(M, +m[1]); S = Math.max(S, +m[2]); }
  const num = (re) => { const m = re.exec(t); return m ? +m[1] : NaN; };
  const I = num(/Summary:[\s\S]*?I:\s*(-?[\d.]+) LUFS/), TP = num(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+)/), P = num(/Sample peak:\s*\n\s*Peak:\s*(-?[\d.]+)/);
  const dur = +spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout.trim();
  const r2 = (x) => Math.round(x * 100) / 100;
  return { I: r2(I), M: r2(M), S: r2(S), TP: r2(TP), P: r2(P), dur: r2(dur) };
}

/** a recording cut into the game, and its manifest entry */
function cut(src, slug) {
  mkdirSync(OUT, { recursive: true });
  const trim = "aformat=channel_layouts=mono,silenceremove=start_periods=1:start_threshold=-50dB,afade=d=0.005,areverse,"
    + "silenceremove=start_periods=1:start_threshold=-50dB,afade=d=0.03,areverse";
  const lufs = /I:\s*(-?[\d.]+) LUFS/.exec(ff(["-i", src, "-af", `${trim},ebur128`, "-f", "null", "-"]).stderr.split("Summary:")[1] ?? "");
  if (!lufs) throw new Error(`could not measure ${src}`);
  const af = `${trim},volume=${(-15 - +lufs[1]).toFixed(2)}dB,alimiter=limit=0.84:attack=2:release=60:level=disabled`;
  const ogg = join(OUT, `${slug}.ogg`), m4a = join(OUT, `${slug}.m4a`);
  for (const [file, codec] of [[ogg, ["-c:a", "libopus", "-b:a", "64k"]], [m4a, ["-c:a", "aac", "-b:a", "96k"]]]) {
    const r = ff(["-loglevel", "error", "-y", "-i", src, "-af", af, "-ac", "1", "-ar", "48000", ...codec, file]);
    if (r.status) throw new Error(r.stderr);
  }
  const lu = measure(ogg);
  const man = JSON.parse(readFileSync(MANIFEST, "utf8"));
  man.files[`vo/${slug}`] = { dur: lu.dur, ch: 1, cat: "vo", lufs: lu, bytes: { ogg: statSync(ogg).size, m4a: statSync(m4a).size } };
  // the announcer's loudness target (the loader levels each file to its category's: [measure, LUFS, max true peak])
  man.norm.vo ??= ["I", -15.0, -1.0];
  writeFileSync(MANIFEST, JSON.stringify(man) + "\n");
  console.log(`${ogg} + .m4a: ${lu.dur} s, ${lu.I} LUFS, true peak ${lu.TP} dB`);
}

const [cmd, a, b] = process.argv.slice(2);
if (!cmd) {
  const have = existsSync(OUT) ? new Set(readdirSync(OUT).filter((f) => f.endsWith(".ogg")).map((f) => f.slice(0, -4))) : new Set();
  for (const [s, t] of Object.entries(LINES)) console.log(`${have.has(s) ? "in game" : "       "}  ${s.padEnd(16)} ${t}`);
  for (const s of FROM_ONESHOT) console.log(`${have.has(s) ? "in game" : "       "}  ${s.padEnd(16)} (oneshot)`);
} else if (cmd === "make") {
  const text = LINES[a]; if (!text) throw new Error(`no line ${a}`);
  mkdirSync(TAKES_DIR, { recursive: true });
  for (let n = 1; n <= TAKES; n++) {
    const f = join(TAKES_DIR, `${a}_${n}.mp3`);
    writeFileSync(f, await record(text));
    const m = measure(f);
    console.log(`${a} take ${n}: "${await heard(f)}"  ${m.dur} s  ${m.I} LUFS`);
  }
} else if (cmd === "keep") cut(join(TAKES_DIR, `${a}_${b}.mp3`), a);
else if (cmd === "import") cut(a, b);
else { console.error("usage: node tools/audio/vo.mjs [make <slug> | keep <slug> <n> | import <file> <slug>]"); process.exitCode = 2; }
