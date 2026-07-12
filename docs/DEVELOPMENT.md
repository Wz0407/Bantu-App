# MyBantu local development setup

## Prerequisites

- **Node.js 24.x** and npm. The repository targets the Node 24 major line: CI pins
  `node-version: 24`, `.nvmrc` selects `24`, and `package.json` `engines.node` is
  `>=24 <25` (any 24.x patch is fine; a different major is not supported). Run
  `nvm use` to match.
- .NET SDK 10 (see [ADR-007](adr/ADR-007-phase0-toolchain.md); the solution uses the
  `.slnx` format, which requires SDK 10 / recent tooling).
- CMake ≥ 3.20 plus a C++20 compiler (GCC/Clang/MSVC) and Ninja or Make
- Git

No cloud account, API key, or internet connection is needed to run the stack
(internet is needed once for dependency installation and the GoogleTest download).

## First-time setup

```bash
scripts/bootstrap/bootstrap.sh        # or scripts\bootstrap\bootstrap.ps1 on Windows
```

This checks the toolchain, runs `npm install`, restores the .NET solution, and
creates `.env` from `.env.example`.

## Running the stack

```bash
scripts/start-local/start-dev.sh      # or scripts\start-local\start-dev.ps1
```

| Service                | URL                                                 |
| ---------------------- | --------------------------------------------------- |
| React dev server       | http://127.0.0.1:5173                               |
| ASP.NET Core API       | http://127.0.0.1:5100 (public boundary)             |
| Document AI (internal) | http://127.0.0.1:5210 (loopback only; never expose) |

Check health: `scripts/health-check.sh` (needs `curl`).

Expected Phase 0 state: the app loads and the System Status screen reports
**degraded** with the translation engine and AI providers `NotConfigured` — that is
correct and honest until models are installed in later phases.

## Building and testing everything

```bash
npm run build && npm test && npm run lint          # web, document-ai, shared-types
dotnet build services/api/MyBantu.slnx && dotnet test services/api/MyBantu.slnx
cmake -S native/trilingua -B native/trilingua/build
cmake --build native/trilingua/build
ctest --test-dir native/trilingua/build --output-on-failure
```

Formatting: `npm run format` (Prettier) for TS/JSON/MD; `.editorconfig` covers the rest.

## What must never be committed

Secrets, `.env`, model weights (`models/*`), user documents and databases
(`data/app`, `data/documents`, `data/indexes`), generated indexes, or build
outputs. `.gitignore` enforces this; do not weaken it.
