#!/usr/bin/env bash
set -euo pipefail

bun install --frozen-lockfile --ignore-scripts
bun run --cwd packages/app build
