#!/bin/bash
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd "$HOME/AI/BQ" || exit 1

echo "=== latency from this Mac (Dubai) to the live site, fra1 + Neon Frankfurt"
for path in / /who; do
  t=$( { for i in 1 2 3 4 5; do
      curl -s -o /dev/null -w "%{time_total}\n" "https://smashqueue.vercel.app$path"
    done; } | sort -n | sed -n '3p' )
  echo "    $path  median ${t}s"
done

echo "=== tidying helper scripts"
rm -f scripts/_setenv.sh scripts/_setdb.sh scripts/_fixenv.sh scripts/_deploynow.sh
ls scripts/

echo "=== committing the deploy script fix"
git add -A
git commit -q -F - <<'MSG'
Harden the deploy script against two failures hit while going live

The Neon connection string contains an ampersand. Unquoted in the env file,
bash reads it as a background operator, so sourcing the file left DATABASE_URL
empty and the variable was pushed to Vercel as an empty string - a failure that
looks like everything worked until the build cannot reach the database.

Recent Vercel CLI versions also prompt for sensitivity when a value arrives on
stdin, which consumes the piped value and leaves the variable unset. Switched
to --value with --force --yes, and the script now refuses to continue if a
variable resolves empty rather than deploying a broken configuration.

Variables are set for preview and development as well, so branch builds work.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015Ug1Y9LMyjPP6xH98pxx1T
MSG
echo "commit exit=$?"
git push -q origin main 2>&1 | tail -1
echo "push exit=$?"
git log --oneline -1
