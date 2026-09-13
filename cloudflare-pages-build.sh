#!/usr/bin/env bash
set -euo pipefail

bun install --frozen-lockfile --ignore-scripts
bun run --cwd packages/app build

test -f packages/app/dist/index.html || {
  echo "Cloudflare Pages build did not produce packages/app/dist/index.html" >&2
  exit 1
}
