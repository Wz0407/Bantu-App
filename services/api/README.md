# MyBantu API (ASP.NET Core)

The single browser-facing application boundary (ADR-001). Owns the public API,
validation, orchestration, metadata, and (later) report workflows.

## Layers

- `MyBantu.Api` — thin HTTP host; endpoints delegate to application services.
- `MyBantu.Application` — application services and provider-independent interfaces
  (`ITranslationEngine`, `IDocumentAiClient`).
- `MyBantu.Domain` — shared contract records mirroring `packages/contracts`.
- `MyBantu.Infrastructure` — adapters: `NotConfiguredTranslationEngine` (Phase 1
  replaces with a P/Invoke adapter over the TriLingua C ABI) and
  `DocumentAiHttpClient` (typed client for `/internal/v1`).

## Phase 0 state

- `GET /health` — aggregate health with honest `NotConfigured`/`Unavailable` states.
- Typed, startup-validated configuration (`MyBantu` section / `MyBantuOptions`).
- Machine-readable `ErrorResponse` envelope for unhandled errors and unknown routes.
- No EF Core entities, migrations, authentication, or business endpoints yet.

## Commands

```bash
dotnet build MyBantu.slnx
dotnet test MyBantu.slnx
dotnet run --project src/MyBantu.Api    # http://127.0.0.1:5100
```
