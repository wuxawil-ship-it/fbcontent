#!/usr/bin/env bash
# .env se GitHub Actions ke secrets set karta hai.
# Values sirf tumhare computer se seedha tumhari private repo mein jati hain.
#
#   bash scripts/gh-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

GH="${GH:-$HOME/.local/bin/gh}"
[ -x "$GH" ] || GH=gh

for key in GEMINI_API_KEY FB_PAGE_ID FB_PAGE_TOKEN; do
  value="$(grep -E "^${key}=" .env | head -1 | cut -d= -f2-)"
  if [ -z "$value" ]; then
    echo "  ! $key .env mein khaali hai — chhor rahe hain"
    continue
  fi
  printf '%s' "$value" | "$GH" secret set "$key"
  echo "  ✓ $key set ho gaya"
done

echo
echo "Maujooda secrets:"
"$GH" secret list
