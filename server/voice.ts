// SQUAD VOICE + CASTER LISTEN-IN — the server's half (client: client/src/voice). The audio itself never touches the
// server: players' browsers talk WebRTC to each other (squadmates, a mesh of ≤ 3) and to the caster seats listening to
// their squad. The server only relays the handshake (offers, answers, ICE candidates — JSON on the primary socket) and
// keeps the facts both ends need to agree on:
//   - who in a squad has a microphone ({ t: "voice", mic }) — a pair connects only when at least one side can talk
//   - which caster seats listen to which squads ({ t: "listen", team, on } from a seat)
// Every change re-sends that squad's roster ({ t: "voiceroster", team, mates: [{ pid, mic, name }], listeners: [seat] })
// to its humans and to the seats listening to it. The clients derive the connections from the roster (the mic holder —
// the lower pid when both have one — offers; a player always offers to a seat), so a reconnect or a late joiner just
// gets a fresh roster.
// Relay rules (the trust boundary): a player reaches only its own squadmates and the seats listening to its squad; a
// seat reaches only the humans of squads it listens to. Payloads ≤ 12 KB, ≤ 30 relays a second per client (burst 80:
// a new connection trickles ~10-20 ICE candidates at once).
import { WebSocket } from "ws";

export interface VoiceClient { pid: number; seat: number; name: string; sock: { ws: WebSocket } }
export interface VoiceLobby { clients: VoiceClient[]; casters: VoiceClient[]; match: { teamOf(pid: number): number } | null }

interface VoiceExtra { mic: boolean; tokens: number; refill: number }
const extra = new WeakMap<VoiceClient, VoiceExtra>();
const ex = (c: VoiceClient) => { let e = extra.get(c); if (!e) { e = { mic: false, tokens: 80, refill: Date.now() }; extra.set(c, e); } return e; };
/** seat → the squads it listens to, per lobby */
const listens = new WeakMap<VoiceLobby, Map<number, Set<number>>>();
const seatTeams = (l: VoiceLobby, seat: number) => { let m = listens.get(l); if (!m) { m = new Map(); listens.set(l, m); } let s = m.get(seat); if (!s) { s = new Set(); m.set(seat, s); } return s; };

const RATE_PER_S = 30, BURST = 80, MAX_SIGNAL = 12_000;
const send = (c: VoiceClient, o: unknown) => { if (c.sock.ws.readyState === WebSocket.OPEN) c.sock.ws.send(JSON.stringify(o)); };

/** the roster of squad `team` → its humans and the seats listening to it */
export function voiceRoster(l: VoiceLobby, team: number) {
  const m = l.match; if (!m || team < 0) return;
  const mates = l.clients.filter((q) => q.pid >= 0 && m.teamOf(q.pid) === team);
  const seats = l.casters.filter((c) => listens.get(l)?.get(c.seat)?.has(team));
  const msg = { t: "voiceroster", team, mates: mates.map((q) => ({ pid: q.pid, mic: ex(q).mic, name: q.name })), listeners: seats.map((c) => c.seat) };
  for (const q of mates) send(q, msg);
  for (const c of seats) send(c, msg);
}
/** every squad with a human in it (match start, a late joiner, someone left) */
export function voiceRosters(l: VoiceLobby) {
  const m = l.match; if (!m) return;
  const teams = new Set<number>();
  for (const q of l.clients) if (q.pid >= 0) teams.add(m.teamOf(q.pid));
  for (const t of teams) voiceRoster(l, t);
}
/** the match ended: everyone drops every voice connection (squads change with the next match); listen-ins are kept */
export function voiceReset(l: VoiceLobby) {
  for (const q of l.clients) send(q, { t: "voiceroster", team: -1, mates: [], listeners: [] });
}
/** a seat left the lobby: it listens to nothing any more */
export function voiceSeatLeft(l: VoiceLobby, seat: number) {
  const teams = listens.get(l)?.get(seat); if (!teams) return;
  listens.get(l)!.delete(seat);
  for (const t of teams) voiceRoster(l, t);
}

/** "rtc" / "voice" / "listen" from a client in lobby `l`; false = not a voice message */
export function onVoiceJSON(c: VoiceClient, l: VoiceLobby | null, msg: { t?: unknown; [k: string]: unknown }): boolean {
  const m = l?.match ?? null;
  switch (msg.t) {
    case "voice": {
      // (recorded even between matches: a fresh client says mic:false, so a rejoin never inherits a stale "has a mic")
      const mic = msg.mic === true, e = ex(c);
      if (e.mic !== mic) { e.mic = mic; if (l && c.pid >= 0 && m) voiceRoster(l, m.teamOf(c.pid)); }
      return true;
    }
    case "listen": {
      if (c.seat < 0 || !l) return true;
      const team = Number(msg.team); if (!Number.isInteger(team) || team < 0 || team > 255) return true;
      const set = seatTeams(l, c.seat), on = msg.on === true;
      if (on === set.has(team)) { send(c, { t: "listening", teams: [...set] }); return true; }
      if (on) set.add(team); else set.delete(team);
      send(c, { t: "listening", teams: [...set] });
      voiceRoster(l, team);
      // a seat that stops listening still needs the (now listener-less) roster to close its connections
      if (!on) send(c, { t: "voiceroster", team, mates: [], listeners: [] });
      return true;
    }
    case "rtc": {
      const e = ex(c), now = Date.now();
      e.tokens = Math.min(BURST, e.tokens + ((now - e.refill) / 1000) * RATE_PER_S); e.refill = now;
      if (e.tokens < 1 || !m || !l) return true;
      e.tokens -= 1;
      const to = typeof msg.to === "string" ? /^([ps])(\d{1,3})$/.exec(msg.to) : null; if (!to) return true;
      const d = msg.d; if (!d || typeof d !== "object") return true;
      let size = 0; try { size = JSON.stringify(d).length; } catch { return true; }
      if (size > MAX_SIGNAL) return true;
      const n = Number(to[2]);
      if (c.seat >= 0) {
        // a seat answers a player of a squad it listens to
        if (to[1] !== "p") return true;
        const q = l.clients.find((x) => x.pid === n); if (!q) return true;
        if (!listens.get(l)?.get(c.seat)?.has(m.teamOf(n))) return true;
        send(q, { t: "rtc", from: `s${c.seat}`, d });
      } else if (c.pid >= 0) {
        const team = m.teamOf(c.pid);
        if (to[1] === "p") {
          const q = l.clients.find((x) => x.pid === n);
          if (!q || q === c || m.teamOf(n) !== team) return true;
          send(q, { t: "rtc", from: `p${c.pid}`, d });
        } else {
          const s = l.casters.find((x) => x.seat === n);
          if (!s || !listens.get(l)?.get(n)?.has(team)) return true;
          send(s, { t: "rtc", from: `p${c.pid}`, d });
        }
      }
      return true;
    }
  }
  return false;
}
