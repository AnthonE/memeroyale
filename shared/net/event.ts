// EVENT LOBBIES (admin lobby): a lobby the ADMIN runs from /admin. Players arrive by a public link
// (`<site>/?e=CODE`) that grants nothing but "join this lobby as a player". Every authority (mode, teams, kick, start,
// end, close) is the admin's, checked on the server per message; a player in an event lobby is never its host.
//
// This file is the wire contract between server/index.ts + server/admin/*, the player client (client/src/ui/event-lobby.ts
// via client/src/game/index.ts) and the admin console (client/src/admin/*). JSON only (the binary match protocol is
// untouched). NET_VERSION 10 = event lobbies.

/** the code in a player link: 6 characters from the lobby code alphabet */
export const EVENT_CODE_LEN = 6;
export const EVENT_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
/** the page parameter of a player link: `?e=CODE` */
export const EVENT_PARAM = "e";
/** a player's session token (localStorage `kr-player-tok`, sent with every join): 32 lower-case hex */
export const PLAYER_TOKEN_RE = /^[0-9a-f]{32}$/;
export const EVENT_NAME_MAX = 32;
export const EVENT_CAP_MIN = 2, EVENT_CAP_MAX = 50, EVENT_CAP_DEFAULT = 24;
/** players per team in TRIOS */
export const EVENT_TEAM_SIZE = 3;
/** team cards in TRIOS: enough for the cap */
export const eventTeamCount = (cap: number) => Math.ceil(cap / EVENT_TEAM_SIZE);

// ------------------------------------------------------------------ player socket (/ws)
// client → server
//   { t: "hello", name }                     (as today) — in an event lobby only before / at join; later ignored
//   { t: "join", code, tok }                 join by code. `tok` (PLAYER_TOKEN_RE) is REQUIRED for an event lobby
//   { t: "team", team }                      pick a TRIOS team (0 … teams-1) or -1 = no team (auto-placed at START)
//   { t: "leave" }                           (as today)
// server → client
//   { t: "lobby", …core fields…, ev: EventRoom }    the room (core frame + `ev` for event lobbies; `host` is always 0)
//   { t: "error", msg }                       a refusal, in words for the screen (TEAM 3 IS FULL, TEAMS ARE LOCKED …)
//   { t: "evend", why: EventEndReason, msg }  you are out of this lobby for good (then the server closes the socket)

export type EventEndReason = "kicked" | "closed" | "replaced";

/** a player row in an event room (`lobby.players[i]` also carries these) */
export interface EventPlayer {
  id: number;
  name: string;
  /** the picked TRIOS team (0-based), −1 = none yet (auto-placed at START). SOLO: always −1 */
  team: number;
}

/** `lobby.ev`: what a player's room screen shows */
export interface EventRoom {
  name: string;
  /** player cap (≤ 50) */
  cap: number;
  /** TRIOS team cards (eventTeamCount(cap)); SOLO: 0 */
  teams: number;
  /** no new players may join (known players may still reconnect) */
  locked: boolean;
  /** players can't change their own team (the admin still can) */
  teamsLocked: boolean;
  /** every player row, team-aware */
  players: EventPlayer[];
}

/** GET /api/event/CODE (no auth, public: what the link screen shows before joining) */
export type EventPublicInfo =
  | { ok: true; code: string; name: string; mode: "solo" | "trios"; count: number; cap: number; locked: boolean; inMatch: boolean }
  | { ok: false; error: "not-found" };

// ------------------------------------------------------------------ admin (/admin/api/*, /admin/ws)
// HTTP (same origin only; JSON bodies ≤ 2 KB; the cookie `kr_admin` is HttpOnly + SameSite=Strict [+ Secure on https]):
//   POST /admin/api/login   { key }   → 200 { ok: true } + cookie | 403 { ok: false, error } | 429 { ok: false, error, retryS }
//   POST /admin/api/logout  {}        → 200 { ok: true } (cookie cleared, the session's sockets closed)
//   GET  /admin/api/session           → 200 { ok: true, expiresAt } | 401 { ok: false }
//   GET  /admin/console.js            → the console bundle — ONLY with a valid session (401 otherwise)
// WebSocket /admin/ws (same origin + a valid session at the upgrade; every message re-checks the session):
//   server → admin: AdminServerMsg            admin → server: AdminAct

export interface AdminPlayer {
  id: number;
  name: string;
  /** TRIOS team (0-based) or −1 = none */
  team: number;
  /** where they are: in the room, playing the match, dead / spectating, or in the room while a match runs */
  state: "room" | "playing" | "out" | "waiting";
  /** round trip ms the server measured (0 = not yet) */
  ping: number;
  /** joined (ms since epoch) */
  joinedAt: number;
  /** renamed by the admin (the player can no longer change it) */
  renamed: boolean;
}
export interface AdminMatch {
  /** 0 warm-up, 1 plane, 2 in play, 3 results */
  phase: number;
  alive: number;
  squads: number;
  /** match seconds */
  time: number;
  humans: number;
}
export interface AdminLobby {
  code: string;
  name: string;
  mode: "solo" | "trios";
  cap: number;
  teams: number;
  locked: boolean;
  teamsLocked: boolean;
  /** commentator seats (?cast=CODE) may join this lobby */
  casters: boolean;
  casterCount: number;
  createdAt: number;
  match: AdminMatch | null;
  players: AdminPlayer[];
  /** removed players (kid = an opaque id for "allow back"; never a token or an address) */
  kicked: Array<{ kid: string; name: string; at: number }>;
  /** matches played in this lobby */
  round: number;
}
export type AdminServerMsg =
  | { t: "state"; now: number; lobbies: AdminLobby[]; eventMode: boolean }
  | { t: "ack"; id: number; ok: boolean; msg: string; code?: string }
  | { t: "bye"; why: "expired" | "logout" | "restart" };

/** every admin action; `id` is echoed in the ack */
export type AdminAct = { t: "act"; id: number } & (
  | { a: "create"; name: string; mode: "solo" | "trios"; cap: number }
  | { a: "mode"; code: string; mode: "solo" | "trios" }
  | { a: "cap"; code: string; cap: number }
  | { a: "name"; code: string; name: string }
  | { a: "lock"; code: string; on: boolean }
  | { a: "teamlock"; code: string; on: boolean }
  | { a: "casters"; code: string; on: boolean }
  | { a: "move"; code: string; uid: number; team: number }
  | { a: "balance"; code: string }
  | { a: "shuffle"; code: string }
  | { a: "kick"; code: string; uid: number }
  | { a: "unkick"; code: string; kid: string }
  | { a: "rename"; code: string; uid: number; name: string }
  | { a: "start"; code: string }
  /** skip the rest of the warm-up: the plane leaves now */
  | { a: "launch"; code: string }
  | { a: "end"; code: string }
  | { a: "close"; code: string }
);
export type AdminActName = AdminAct["a"];
