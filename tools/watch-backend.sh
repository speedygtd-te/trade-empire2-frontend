#!/usr/bin/env bash
# Watches the backend for changes that matter to the client and prints one line per change:
# the contract file (openapi.yaml), the backend's main branch, and the contract version the
# live server reports (/v2/health apiVersion). The last reported state is kept in
# build/backend-watch.state, so a restarted watch reports what changed while it was not
# running instead of starting from scratch.
#
#   bash tools/watch-backend.sh [interval seconds]
set -u
repo="/f/Trade Empire/Backend-V2"
spec="$repo/openapi.yaml"
state="$(dirname "$0")/../build/backend-watch.state"
interval="${1:-300}"
mkdir -p "$(dirname "$state")"

read_state() { [ -f "$state" ] && grep -m1 "^$1=" "$state" | cut -d= -f2- || true; }

spec_hash=$(read_state spec); head=$(read_state head); live=$(read_state live)
first=1
while true; do
  [ $first -eq 1 ] || sleep "$interval"
  first=0
  now_hash=$(sha1sum "$spec" 2>/dev/null | cut -c1-12)
  now_head=$(git -C "$repo" rev-parse --short HEAD 2>/dev/null)
  now_live=$(curl -s -m 10 https://trade-empire.net/v2/health | sed -n 's/.*"apiVersion":"\([^"]*\)".*/\1/p')
  if [ -n "$now_hash" ] && [ "$now_hash" != "$spec_hash" ]; then
    version=$(grep -m1 -E '^\s+version: 2' "$spec" | tr -d ' ')
    echo "OPENAPI CHANGED ${spec_hash:-none} -> $now_hash ($version)"; spec_hash=$now_hash
  fi
  if [ -n "$now_head" ] && [ "$now_head" != "$head" ]; then
    echo "BACKEND HEAD ${head:-none} -> $now_head: $(git -C "$repo" log -1 --format=%s 2>/dev/null)"; head=$now_head
  fi
  if [ -n "$now_live" ] && [ "$now_live" != "$live" ]; then
    echo "LIVE apiVersion ${live:-none} -> $now_live"; live=$now_live
  fi
  printf 'spec=%s\nhead=%s\nlive=%s\n' "$spec_hash" "$head" "$live" > "$state"
done
