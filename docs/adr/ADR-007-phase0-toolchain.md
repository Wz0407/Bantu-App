# ADR-007: Phase 0 toolchain and contract-sharing choices

Status: accepted — 2026-07-12

## Context

ARCHITECTURE.md fixes the languages, frameworks, boundaries, and repository layout
(ADR-001…006), but Phase 0 still required concrete tooling decisions it does not
resolve. This ADR records them; it does not repeat decisions already made.

## Decisions

1. **Vite for the React frontend.** ARCHITECTURE.md mandates React + TypeScript but
   no build tool. Vite provides strict-TS builds, a dev server with an API proxy
   (keeping the frontend talking only to the ASP.NET Core API in development), and
   first-class Vitest integration already named in the testing table.

2. **npm workspaces for the TypeScript monorepo.** `apps/web`, `services/document-ai`,
   and `packages/shared-types` share one lockfile and node_modules. No extra monorepo
   tool (Nx/Turbo) — unnecessary for three packages.

3. **JSON Schema as the contract source of truth.** `packages/contracts` holds
   draft 2020-12 schemas; `packages/shared-types` mirrors them for TypeScript and
   `MyBantu.Domain/Contracts` for C#. Automated drift tests on **both** sides read the
   canonical schema files at test time and compare their enums against the mirror:
   `packages/shared-types/tests/contracts.test.ts` reads them from the workspace, and
   `MyBantu.UnitTests/ContractTests.cs` reads copies emitted next to the test assembly
   (see the `Content` copy rule in `MyBantu.UnitTests.csproj`). A schema change that is
   not reflected in a mirror fails the corresponding test. Code generation was rejected
   for Phase 0 as heavier than the problem (seven small schemas).

4. **Node built-in `http` for the Document AI internal service.** The Phase 0 surface
   is one health route. Express/Fastify would be an unused dependency; a framework can
   be introduced in Phase 2 behind the same router seam if routing grows.

5. **GoogleTest via CMake FetchContent.** Matches the testing table; FetchContent
   avoids committing third-party sources. The download happens once at configure time
   and is cached; this affects developer machines and CI only, never the shipped
   offline product.

6. **Health endpoints report `degraded` while AI components are unconfigured.**
   The services themselves are up, but claiming `healthy` with no models installed
   would violate the honesty principle. `healthy` requires every component `Available`.

7. **.NET 10 is the intentional SDK baseline.** All C# projects target `net10.0`
   (`services/api/Directory.Build.props`) and CI pins `dotnet-version: 10.0.x`.
   Developers must install .NET SDK 10. This is the current baseline, not a preview
   pin; a future bump requires updating both the props file and the CI matrix.

8. **`.slnx` is the intentional solution format.** The API solution is
   `services/api/MyBantu.slnx` (the XML solution format), chosen because it was produced
   natively by SDK 10 tooling and is cleaner to review and diff than the legacy `.sln`.
   Trade-off: older IDEs and tooling may not open `.slnx`. Contributors and CI must use
   `.slnx`-aware tooling (SDK 10 CLI, recent Visual Studio / Rider / VS Code C# Dev Kit).
   All scripts, docs, and CI reference `MyBantu.slnx` consistently; no `.sln` is kept.

## Consequences

- Phase 1+ contract changes must update schema + both mirrors; the sync tests fail
  otherwise.
- The Document AI service gains routes in Phase 2; if the hand-rolled router becomes
  awkward, adopting Fastify then is a contained change.
- CI (Ubuntu, GCC) and local Windows (MinGW GCC) builds share a compiler family; an
  MSVC job can be added when Windows packaging work starts. (The native library and
  tests have since been verified to build cleanly under MSVC `/W4 /WX` as well.)
- Contributors need .NET SDK 10 and `.slnx`-aware tooling; a legacy-`.sln` fallback is
  intentionally not maintained.
