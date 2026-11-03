#!/usr/bin/env bash
# KONGBOT's MongoDB as a plain user process (no docker / root): npm run kongbot:db
#   KR_MONGOD=/path/to/mongod     binary (default: mongod on PATH, else the mongodb-memory-server cache in ~/.cache)
#   KR_MONGO_DATA=dir             data directory (default ~/.local/share/kong-royale/mongo)
#   KR_MONGO_PORT=27017           port (127.0.0.1 only)
#   npm run kongbot:db -- stop    shut it down cleanly
set -euo pipefail
PORT="${KR_MONGO_PORT:-27017}"
DATA="${KR_MONGO_DATA:-$HOME/.local/share/kong-royale/mongo}"
BIN="${KR_MONGOD:-$(command -v mongod || true)}"
if [[ -z "$BIN" ]]; then BIN="$(ls -1 "$HOME"/.cache/mongodb-binaries/mongod-* 2>/dev/null | grep -v '\.md5$' | sort -V | tail -1 || true)"; fi
if [[ -z "$BIN" || ! -x "$BIN" ]]; then
  echo "no mongod found: install MongoDB, or set KR_MONGOD=/path/to/mongod" >&2; exit 1
fi
mkdir -p "$DATA"
if [[ "${1:-}" == "stop" ]]; then "$BIN" --dbpath "$DATA" --shutdown; exit 0; fi
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "mongod already listening on 127.0.0.1:$PORT"; exit 0; fi
# a small cache: the machine also runs the game and vite
"$BIN" --dbpath "$DATA" --port "$PORT" --bind_ip 127.0.0.1 --wiredTigerCacheSizeGB 0.25 \
  --fork --logpath "$DATA/mongod.log" --logappend >/dev/null
echo "mongod on 127.0.0.1:$PORT (data $DATA, log $DATA/mongod.log)"
