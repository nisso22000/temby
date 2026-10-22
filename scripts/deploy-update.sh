#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
test -f .env || { echo 'Missing .env (copy .env.example first).' >&2; exit 1; }
git fetch --prune origin
previous="$(git rev-parse HEAD)"
git pull --ff-only
if ! docker compose config -q; then
  echo "Compose validation failed; the running release was not changed. Restore source with: git checkout $previous" >&2
  exit 1
fi
docker compose build --pull temby
if ! docker compose up -d --wait --remove-orphans; then
  echo "Update failed; run scripts/rollback.sh $previous" >&2
  exit 1
fi
echo "Deployed $(git rev-parse --short HEAD). Roll back with: scripts/rollback.sh $previous"
