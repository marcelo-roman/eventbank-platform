#!/usr/bin/env bash
set -euo pipefail

platform="$(cd "$(dirname "$0")/.." && pwd)"

"$platform/scripts/local-feed.sh"
docker compose --project-directory "$platform" \
  -f "$platform/docker-compose.yml" \
  -f "$platform/docker-compose.build.yml" \
  up --build --detach

echo "EventBank is starting at http://localhost:3000. Run scripts/seed.sh for demo data."
