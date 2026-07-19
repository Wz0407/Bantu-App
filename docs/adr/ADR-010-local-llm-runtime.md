# ADR-010: Local LLM and runtime

Status: accepted — 2026-07-19
Related: [rag-feasibility.md](../evaluation/rag/rag-feasibility.md), ADR-009, ADR-011

## Decision

**Qwen/Qwen2.5-1.5B-Instruct** in the official **GGUF Q4_K_M** conversion
(Apache 2.0, ~1.12 GB), executed locally in the Document AI service via
**node-llama-cpp** (MIT; bundles prebuilt llama.cpp binaries for Windows/Linux/
macOS x64 CPU).

| Property          | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Licence           | Apache 2.0 (model, official Qwen GGUF), MIT (runtime)                           |
| Parameters        | 1.54 B; context 32k (MyBantu caps context far lower)                            |
| RAM               | ~1.5–2 GB resident at Q4_K_M with a small context                               |
| Structured output | node-llama-cpp **enforces a JSON schema grammar** during decoding               |
| Install           | `scripts/model-setup/setup-rag-models.py` (one-time internet; SHA-256 manifest) |

## Rationale

- Chinese capability is first-class in Qwen (a hard requirement); English strong;
  Malay serviceable at this scale — and MyBantu's grounded design keeps the LLM on
  a short leash (evidence in, structured JSON out), which small models handle well.
- Grammar-enforced JSON eliminates the biggest small-model failure mode
  (malformed/chatty output) without retries.
- Rejected: **Llama-3.2-1B/3B** (community licence with use restrictions vs
  Apache 2.0); **Phi-3.5-mini** (MIT but weaker zh); **Gemma-2-2b** (Gemma terms);
  larger Qwen variants (3B+ strain the 8 GB target alongside translation + OCR).
- Runtime: llama.cpp via node-llama-cpp keeps the LLM inside the Document AI
  service boundary (ADR-002) with no extra process to orchestrate; ONNX Runtime
  has no comparable turnkey GGUF/grammar support.

## Constraints and failure behavior

- Local-only: the runtime loads a local file path; no endpoint configuration
  exists. Missing model → `NotInstalled` / `LOCAL_LLM_UNAVAILABLE`.
- Timeouts and max-token caps bound every generation; cancellation aborts decode.
- Model name/version (from the manifest) is attached to every answer for
  diagnostics. Prompt content is never logged (AGENTS §14).
- Documented risk: 1.5B-scale reasoning is limited — mitigated by deterministic
  extraction before LLM steps, insufficient-evidence refusal, and citations that
  the UI verifiably renders from retrieved chunks.
