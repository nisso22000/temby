#!/usr/bin/env bash
# Samples target-side resource use while running a safe load command.
set -Eeuo pipefail
test "${1:-}" && test "${2:-}" = -- || { echo "Usage: $0 <output-directory> -- <load-command...>" >&2; exit 64; }
output="$1";shift 2;mkdir -p "$output"
stats="$output/docker-stats.csv";network="$output/host-network.csv"
printf 'time_utc,container,cpu,memory,network\n' > "$stats"
printf 'time_utc,interface,rx_bytes,tx_bytes\n' > "$network"
"$@" > "$output/load-result.json" 2> "$output/load-stderr.log" & runner="$!"
while kill -0 "$runner" 2>/dev/null; do
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}' temby-temby-1 temby-redis-1 temby-caddy-1 | while IFS= read -r row; do printf '%s,%s\n' "$now" "$row"; done >> "$stats"
  for interface in /sys/class/net/*; do
    name="${interface##*/}"; test "$name" = lo && continue
    printf '%s,%s,%s,%s\n' "$now" "$name" "$(<"$interface/statistics/rx_bytes")" "$(<"$interface/statistics/tx_bytes")"
  done >> "$network"
  sleep 1
done
wait "$runner"
