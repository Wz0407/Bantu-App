#!/usr/bin/env bash
# Starts the MyBantu local development stack (Linux/macOS/Git Bash).
# Starts: Document AI service, ASP.NET Core API, React dev server.
# All services bind to loopback only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Both services MUST share one absolute data/models root. Relative "./data"
# resolves against each process's working directory (dotnet run uses the project
# directory), which would split the storage roots and make the Document AI
# path guard reject every ingestion.
export MYBANTU_DATA_DIR="$ROOT/data"
export MYBANTU_MODELS_DIR="$ROOT/models"
export MyBantu__DataDirectory="$ROOT/data"

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
