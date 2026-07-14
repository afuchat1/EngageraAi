#!/usr/bin/env bash
# Publish @afuchat/sdk to npm
# Usage: bash scripts/publish-sdk.sh [--dry-run]
set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 Dry run — will not actually publish"
fi

if [ -z "$NPM_TOKEN" ]; then
  echo "❌ NPM_TOKEN is not set. Add it as a Replit secret first."
  exit 1
fi

echo "🔨 Building @afuchat/sdk..."
cd "$(dirname "$0")/../lib/sdk"

# Write .npmrc with token
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc

pnpm run build

echo "✅ Build complete"

if $DRY_RUN; then
  pnpm publish --dry-run --no-git-checks 2>&1
  echo "✅ Dry run complete — no packages published"
else
  pnpm publish --access public --no-git-checks 2>&1
  echo "🚀 Published @afuchat/sdk to npm!"
fi

# Always clean up the .npmrc so the token isn't committed
rm -f .npmrc
