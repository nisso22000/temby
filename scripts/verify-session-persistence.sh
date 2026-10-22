#!/usr/bin/env bash
# Proves the deployed Redis session behavior without printing cookies or secrets.
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
test -f .env || { echo 'Missing .env.' >&2; exit 1; }
merchant_origin="$(awk -F= '$1=="PUBLIC_MERCHANT_ORIGIN" {print substr($0,index($0,"=")+1); exit}' .env)"
test -n "$merchant_origin" || { echo 'PUBLIC_MERCHANT_ORIGIN is missing from .env.' >&2; exit 1; }
cookies="$(mktemp)"; headers="$(mktemp)"
trap 'rm -f "$cookies" "$headers"' EXIT

# A static engine asset must not allocate a browser session.
curl --fail --silent --show-error --dump-header "$headers" --output /dev/null "$merchant_origin/uv/boot.js"
if grep -qi '^set-cookie:.*temby_sid=' "$headers"; then
  echo 'FAIL: static asset unexpectedly created a session.' >&2; exit 1
fi

# Create a harmless diagnostic event, then prove it is still available after
# restarting only the Node application container. This deliberately restarts
# the app for a few seconds; run it during a maintenance/test window.
curl --fail --silent --show-error --cookie-jar "$cookies" --output /dev/null "$merchant_origin/uv/"
curl --fail --silent --show-error --cookie "$cookies" --cookie-jar "$cookies" \
  --header "Origin: $merchant_origin" --header 'Content-Type: application/json' \
  --data '{"phase":"document-ready"}' --output /dev/null "$merchant_origin/_runtime"
docker compose restart temby >/dev/null
for _ in {1..30}; do
  if curl --fail --silent --show-error --output /dev/null "${merchant_origin/merchant./}/healthz"; then break; fi
  sleep 1
done
state="$(curl --fail --silent --show-error --cookie "$cookies" "$merchant_origin/_state")"
printf '%s' "$state" | grep -q 'document-ready' || { echo 'FAIL: session did not survive the app restart.' >&2; exit 1; }

# The payload held in Redis must be an encrypted envelope, not readable event data.
session_key="$(docker compose exec -T redis sh -ec 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" --scan --pattern "temby:session:*" | grep -E "^temby:session:[a-f0-9]{64}$" | head -n1')"
test -n "$session_key" || { echo 'FAIL: no Redis session record found.' >&2; exit 1; }
if docker compose exec -T redis sh -ec 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" --raw GET "$1"' sh "$session_key" | grep -q 'document-ready'; then
  echo 'FAIL: Redis session record is readable plaintext.' >&2; exit 1
fi
echo 'PASS: static assets are session-free; Redis session persisted across restart and is encrypted at rest.'
