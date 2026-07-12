#!/usr/bin/env bash
# One-time local setup for MyBantu development (Linux/macOS/Git Bash).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Checking required tools..."
for tool in node npm dotnet cmake git; do
  command -v "$tool" >/dev/null || { echo "Required tool '$tool' not found on PATH." >&2; exit 1; }
done
node --version && npm --version && dotnet --version && cmake --version | head -1

echo "Installing npm workspace dependencies..."
npm install --prefix "$ROOT"

echo "Restoring .NET solution..."
dotnet restore "$ROOT/services/api/MyBantu.slnx"

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created .env from .env.example"
fi

echo "Bootstrap complete. Use scripts/start-local/start-dev.sh to run the stack."
