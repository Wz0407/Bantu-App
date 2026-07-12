# @mybantu/contracts

Language-neutral shared contracts for MyBantu, expressed as JSON Schema (draft 2020-12).

These schemas are the source of truth for cross-service payload shapes. Each consumer
mirrors them in its own type system:

| Consumer                           | Mirror                                         |
| ---------------------------------- | ---------------------------------------------- |
| `apps/web`, `services/document-ai` | `packages/shared-types` (TypeScript)           |
| `services/api`                     | `MyBantu.Domain/Contracts` (C# records)        |
| `native/trilingua`                 | C ABI structs in `include/mybantu/trilingua.h` |

## Rules

- Contracts are versioned; `contractVersion` is `v1` for all Phase 0 schemas.
- JSON field names are never silently renamed (AGENTS.md §8).
- Language codes are `en`, `ms`, `zh`; `auto` is allowed only where source-language
  detection is permitted (translation requests).
- Timestamps are ISO 8601 UTC.
- Error responses are machine-readable and use the stable error codes from AGENTS.md §15.

## Schemas

- `schemas/language-code.schema.json` — supported languages.
- `schemas/service-availability.schema.json` — availability states for AI components.
- `schemas/health-status.schema.json` — health report for any MyBantu service.
- `schemas/error-response.schema.json` — standard machine-readable error envelope.
- `schemas/document-processing-status.schema.json` — ingestion lifecycle placeholder.
- `schemas/translation-request.schema.json` — translation request placeholder (Phase 1 fills in behavior).
- `schemas/translation-response.schema.json` — translation response placeholder.

Phase 0 intentionally contains no business entities and no full feature contracts.
