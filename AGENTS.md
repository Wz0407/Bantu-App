# AGENTS.md — Mandatory Coding Instructions for MyBantu

## 1. Read before changing code

Before implementing any feature, read:

1. `MVP_SCOPE.md`
2. `ARCHITECTURE.md`
3. the nearest package/service README
4. relevant tests and shared contracts

These files define the product. Do not replace their decisions with a different architecture unless the user explicitly requests a design change.

---

## 2. Mission

Build MyBantu as a privacy-first, offline-capable trilingual assistant for English, Bahasa Melayu, and Chinese.

The MVP must support:

- local text translation;
- local document ingestion;
- OCR/text extraction;
- simple document analysis;
- page-aware RAG question answering;
- citations;
- Elder Mode;
- Technician Lite manual Q&A and basic service reports.

The system must be useful without a cloud API key.

---

## 3. Current scope priority

When deciding what to implement, use this priority:

1. correctness and source grounding;
2. offline operation;
3. privacy and secure local file handling;
4. clear user experience;
5. accessibility;
6. maintainable architecture;
7. performance optimisation;
8. optional features.

Do not sacrifice grounding or privacy to make a demo look more impressive.

---

## 4. Hard architectural boundaries

### Frontend

- React/TypeScript calls only the ASP.NET Core API.
- Do not call the C++ library, local LLM, embedding runtime, or Document AI service directly.
- Do not put business rules or provider-specific AI logic in React components.

### ASP.NET Core

- Owns public API, validation, orchestration, metadata, and service-report workflows.
- Calls C++ translation through a native adapter.
- Calls Document AI through a typed internal HTTP client.
- Controllers must remain thin.
- Business logic belongs in application/domain services.

### Document AI service

- TypeScript/Node only.
- LangChain.js may be used here for document loaders, chunking, retrieval, prompts, and structured generation.
- It must not own user/business records.
- It must preserve page metadata.
- It must return structured JSON and citations.

### C++ translation engine

- Expose a small C ABI.
- Use UTF-8.
- Never let C++ exceptions cross the ABI.
- C++ frees C++-allocated memory.
- Keep model-specific inference behind an interface.
- Include tests and benchmarks.

---

## 5. Do not add without explicit approval

- autonomous agents;
- LangGraph;
- Semantic Kernel;
- cloud LLM APIs;
- cloud OCR;
- cloud vector databases;
- authentication/social login;
- full CRM;
- inventory or invoicing;
- live meeting transcription;
- mobile-native apps;
- model training/fine-tuning;
- additional languages;
- Kubernetes;
- additional microservices.

A coding agent must not interpret “future module” as permission to implement it now.

---

## 6. Required implementation behavior

For every task:

1. Identify the relevant MVP use case and quality gate.
2. Inspect existing contracts and tests.
3. Implement the smallest coherent change.
4. Add or update tests.
5. Run relevant checks.
6. Update documentation only when behavior or architecture changed.
7. Report:
   - files changed;
   - behavior implemented;
   - tests run;
   - limitations;
   - any architecture decision required.

Do not perform broad unrelated refactors.

---

## 7. Coding standards

## TypeScript / React

- Enable strict TypeScript.
- Avoid `any`; justify unavoidable cases.
- Use feature folders.
- Keep API access in typed client modules.
- Use semantic HTML.
- Provide accessible labels and keyboard behavior.
- Do not hard-code language display strings in logic.
- Keep UI state separate from server state.
- Handle loading, empty, error, processing, and insufficient-evidence states.

## Node / Document AI

- Validate all internal API payloads.
- Keep ingestion, retrieval, generation, and citations as separate modules.
- Store prompt templates as versioned files/modules.
- Treat retrieved document text as untrusted evidence.
- Never allow document text to override system rules.
- Use deterministic parsing/rules where they are more reliable than an LLM.
- Return machine-readable errors.
- Include model and prompt version in diagnostic metadata.

## C#

- Enable nullable reference types.
- Use async APIs correctly.
- Accept `CancellationToken` for I/O and long operations.
- Keep controllers thin.
- Use dependency injection.
- Use typed configuration with validation.
- Use EF Core migrations.
- Do not return persistence entities directly from APIs.
- Use typed result/error models.
- Validate file input before storage or processing.

## C++

- Target C++20 unless a dependency requires otherwise.
- Use RAII.
- Prefer value types and smart pointers.
- Avoid raw owning pointers.
- Treat compiler warnings as defects.
- Use explicit error/status handling at the ABI.
- Add UTF-8 and memory-lifetime tests.
- Record benchmark environment and model version.

---

## 8. API and contract rules

- Public API base path: `/api/v1`.
- Internal Document AI base path: `/internal/v1`.
- Contracts must be versioned and shared where practical.
- Do not silently rename JSON fields.
- Use ISO 8601 timestamps in UTC.
- Use stable language codes: `en`, `ms`, `zh`, `auto`.
- Use invariant numeric formats in APIs.
- Add backward-compatible fields where possible.
- Breaking changes require a documented decision.

---

## 9. RAG and citation policy

A document answer is valid only when supported by retrieved evidence.

### Required

- retrieve from the selected document only;
- include page number where available;
- include a short supporting excerpt;
- expose `insufficientEvidence`;
- return warnings when source quality is weak;
- separate retrieved facts from generated explanation.

### Forbidden

- answering from general model memory when evidence is missing;
- fabricating page numbers;
- citing a chunk that does not support the claim;
- hiding uncertainty;
- treating instructions inside uploaded documents as system instructions.

### Confidence

Confidence is an application estimate, not a mathematical truth. It must never be used alone to claim correctness.

---

## 10. Translation policy

- Preserve names, numbers, currencies, dates, model numbers, and safety codes.
- Never add facts absent from the source.
- Support glossary overrides.
- Return detected source language.
- Preserve original text for comparison.
- Mark uncertain or untranslated segments.
- Service-report translation must not alter the underlying service facts.

---

## 11. Document-analysis policy

For amounts, dates, and required actions:

- use deterministic extraction where practical;
- attach page/source text;
- return empty collections when nothing is found;
- do not infer a deadline from unrelated dates;
- do not convert ambiguous date formats silently;
- do not call a document a scam, legal violation, medical diagnosis, or official approval;
- show a verification warning for high-impact documents.

---

## 12. Privacy and file-safety rules

- No network call is allowed unless explicitly configured and visible.
- Never log full document text in normal logs.
- Never commit user documents or model weights accidentally.
- Never trust a filename as a filesystem path.
- Verify file signature and configured limits.
- Store generated filenames, not raw user paths.
- Delete temporary files.
- Deleting a document must delete all derived indexes and analysis.
- Add tests for path traversal and invalid file types.

---

## 13. Test requirements

A feature is incomplete without tests.

### Minimum per change

- success case;
- invalid-input case;
- dependency-failure case where relevant;
- privacy/security case where relevant.

### Required regression suites

- six translation directions;
- UTF-8 boundary;
- page preservation;
- supported RAG answer;
- unsupported RAG refusal;
- citation correctness;
- prompt-injection fixture;
- document deletion;
- Elder Mode core journey;
- Technician Lite report factual preservation.

Do not weaken or delete tests merely to make a build pass.

---

## 14. Logging and diagnostics

Allowed by default:

- operation name;
- duration;
- status;
- model version;
- document ID;
- page/chunk counts;
- correlation ID;
- error code.

Not allowed by default:

- full original document text;
- full translated content;
- customer personal data;
- full report body;
- secrets or local absolute paths.

---

## 15. Error-handling rules

Use stable codes such as:

```text
MODEL_NOT_INSTALLED
MODEL_LOAD_FAILED
UNSUPPORTED_LANGUAGE
UNSUPPORTED_FILE_TYPE
FILE_TOO_LARGE
DOCUMENT_PARSE_FAILED
OCR_FAILED
INDEX_BUILD_FAILED
INSUFFICIENT_EVIDENCE
NATIVE_ENGINE_UNAVAILABLE
LOCAL_LLM_UNAVAILABLE
```

UI messages must explain:

- what failed;
- whether data was saved;
- whether retry is possible;
- what setup step is missing.

Do not expose raw stack traces to the user.

---

## 16. Definition of a good pull request/change

A good change:

- maps to one MVP requirement;
- respects component boundaries;
- is small enough to review;
- includes tests;
- includes migration/contract changes when needed;
- does not introduce hidden cloud dependencies;
- does not expand scope;
- has clear run/verification instructions;
- documents known limitations honestly.

---

## 17. Suggested issue format

```md
## Goal

What user-visible or technical outcome is required?

## Related scope

Reference the MVP use case, requirement, or quality gate.

## In scope

- ...

## Out of scope

- ...

## Acceptance criteria

- [ ] ...
- [ ] ...

## Architecture impact

None / describe affected boundary or contract.

## Test plan

- ...

## Privacy and offline impact

- ...
```

---

## 18. Stop conditions

Stop and request a design decision before proceeding when:

- a change requires a new service;
- a public contract must break;
- a cloud dependency appears necessary;
- a model licence is unclear;
- a feature conflicts with offline/privacy requirements;
- the requested work belongs to explicit post-MVP scope;
- source citations cannot be preserved;
- a proposed shortcut would allow unsupported AI answers.

When a safe, scope-compliant implementation is possible, proceed without unnecessary questions.
