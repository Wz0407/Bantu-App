#!/usr/bin/env bash
# Checks the health endpoints of the locally running MyBantu services.
set -uo pipefail

API_URL="${MYBANTU_API_URL:-http://127.0.0.1:5100}"
DOC_AI_URL="${MYBANTU_DOCUMENT_AI_URL:-http://127.0.0.1:5210}"
failures=0

check() {
  local name="$1" url="$2"
  if body=$(curl -fsS --max-time 5 "$url" 2>/dev/null); then
    echo "[OK]   $name — $url"
    echo "       $body"
  else
    echo "[FAIL] $name — $url is not responding"
    failures=$((failures + 1))
  fi
}

check "ASP.NET Core API" "$API_URL/health"
check "Document AI (internal)" "$DOC_AI_URL/internal/v1/health"

exit "$failures"
