#!/usr/bin/env bash
# Starts the MyBantu local development stack (Linux/macOS/Git Bash).
# Starts: Document AI service, ASP.NET Core API, React dev server.
# All services bind to loopback only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Building shared types and Document AI service..."
npm run build -w @mybantu/shared-types --prefix "$ROOT"
npm run build -w @mybantu/document-ai --prefix "$ROOT"

echo "Starting Document AI service (http://127.0.0.1:5210)..."
node "$ROOT/services/document-ai/dist/server.js" &
DOC_AI_PID=$!

echo "Starting ASP.NET Core API (http://127.0.0.1:5100)..."
dotnet run --project "$ROOT/services/api/src/MyBantu.Api" &
API_PID=$!

cleanup() {
  kill "$DOC_AI_PID" "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting React dev server (http://127.0.0.1:5173)..."
npm run dev -w @mybantu/web --prefix "$ROOT"
