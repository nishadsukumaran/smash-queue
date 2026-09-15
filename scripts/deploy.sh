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

# Values must be quoted in the env file: a Neon connection string contains '&',
# and unquoted that is a background operator, so the assignment silently
# evaporates and you deploy with an empty DATABASE_URL.
set -a; . "./$ENV_FILE"; set +a

for var in DATABASE_URL QR_SECRET NEXT_PUBLIC_TIME_ZONE; do
  [ -n "${!var:-}" ] || { echo "$var is empty in $ENV_FILE"; exit 1; }
done

echo "==> Linking the Vercel project"
vercel link --yes --project "${VERCEL_PROJECT:-smashqueue}" >/dev/null

echo "==> Pushing environment variables"
for var in DATABASE_URL QR_SECRET NEXT_PUBLIC_TIME_ZONE; do
  value="${!var}"
  [ -n "$value" ] || { echo "$var resolved empty - check quoting in $ENV_FILE"; exit 1; }
  for envn in production preview development; do
    # --value keeps this non-interactive; recent CLI versions prompt for
    # sensitivity when the value arrives on stdin.
    extra=""; [ "$envn" != "development" ] && extra="--sensitive"
    vercel env add "$var" "$envn" --value "$value" --force --yes $extra >/dev/null 2>&1 \
      || vercel env add "$var" "$envn" --value "$value" --force --yes >/dev/null 2>&1
  done
  echo "    $var set"
done

echo "==> Deploying to production"
URL=$(vercel deploy --prod --yes)
echo
echo "Live at: $URL"
echo
echo "QR codes follow whatever domain the app is served from, so there is no"
echo "base URL to keep in sync."
