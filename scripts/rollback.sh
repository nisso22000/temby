#!/usr/bin/env bash
set -Eeuo pipefail
test "${1:-}" || { echo "Usage: $0 <known-good-git-commit>" >&2; exit 64; }
cd "$(dirname "$(readlink -f "$0")")/.."
git diff --quiet && git diff --cached --quiet || { echo 'Refusing rollback with local changes.' >&2; exit 1; }
git checkout --detach "$1"
docker compose config -q
docker compose build --pull temby
docker compose up -d --wait --remove-orphans
echo "Rolled back to $(git rev-parse --short HEAD)."
