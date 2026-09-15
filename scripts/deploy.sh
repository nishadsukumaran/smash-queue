#!/usr/bin/env bash
#
# One-shot production deploy to Vercel.
#
#   vercel login          # once, interactive
#   bash scripts/deploy.sh
#
# Secrets are read from .env.production.local, which is gitignored and never
# committed. Copy .env.example and fill it in if you don't have one.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.production.local"

command -v vercel >/dev/null || { echo "vercel CLI not found: npm i -g vercel"; exit 1; }
vercel whoami >/dev/null 2>&1 || { echo "Not logged in. Run: vercel login"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (see .env.example)"; exit 1; }

set -a; . "./$ENV_FILE"; set +a

for var in DATABASE_URL QR_SECRET NEXT_PUBLIC_BASE_URL NEXT_PUBLIC_TIME_ZONE; do
  [ -n "${!var:-}" ] || { echo "$var is empty in $ENV_FILE"; exit 1; }
done

echo "==> Linking the Vercel project"
vercel link --yes --project smash-queue >/dev/null

echo "==> Pushing environment variables"
for var in DATABASE_URL QR_SECRET NEXT_PUBLIC_BASE_URL NEXT_PUBLIC_TIME_ZONE; do
  # Remove first so a re-run updates rather than erroring on a duplicate.
  vercel env rm "$var" production --yes >/dev/null 2>&1 || true
  printf '%s' "${!var}" | vercel env add "$var" production >/dev/null
  echo "    $var set"
done

echo "==> Deploying to production"
URL=$(vercel deploy --prod --yes)
echo
echo "Live at: $URL"
echo
echo "If NEXT_PUBLIC_BASE_URL does not match that host, update it and redeploy —"
echo "every QR code is built from it."
