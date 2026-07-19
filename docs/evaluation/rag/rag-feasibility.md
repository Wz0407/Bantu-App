# Phase 3A — Local RAG stack feasibility

Date: 2026-07-19. Sources: official model cards / runtime repos (fetched
2026-07-19) plus measurements on the reference machine
(`rag-feasibility-results.json`, produced by `rag_feasibility_probe.mjs`).

## Selected stack (details in ADR-009/010/011)

| Concern           | Selection                                                     | Licence    |
| ----------------- | ------------------------------------------------------------- | ---------- |
| Embeddings        | intfloat/multilingual-e5-small, INT8 ONNX (Xenova conversion) | MIT        |
| Embedding runtime | @huggingface/transformers (local, `allowRemoteModels=false`)  | Apache 2.0 |
| Local LLM         | Qwen2.5-1.5B-Instruct, official GGUF Q4_K_M                   | Apache 2.0 |
| LLM runtime       | node-llama-cpp (CPU-only configured)                          | MIT        |
| Vector index      | per-document JSON, exact cosine (no vector DB)                | —          |

Rejected candidates with reasons are recorded in the ADRs (bge-m3 too heavy,
MiniLM weaker, Llama 3.2 licence restrictions, Phi weak zh, Gemma terms,
larger Qwen variants exceed the RAM target).

## Measured on this machine (Windows x64, CPU-only)

**Embeddings** — model load ~1.0 s; 4 chunk-sized passages embedded in 29–62 ms;
process RSS ~0.5 GB; 384 dims. Cross-lingual sanity: an English bill query ranks
the English bill passage first (0.899 vs ≤0.825 for distractors) and a Chinese
water-bill query ranks the Chinese water passage first (0.914 vs 0.768) —
retrieval-order sanity `true`.

**Local LLM** — CPU-only (`gpu: false`; the machine's GPU is not usable by the
bundled CUDA build and the MVP target is CPU anyway): load 3.8 s; grammar-enforced
JSON answer over delimited evidence in ~31.5 s for a long 3-field answer
(~4 tok/s); RSS 2.09 GB. Output was **valid JSON** with the correct amount
(RM187.45) and deadline (18 July 2026) taken from the evidence.

## Context-window and chunking assumptions

Retrieval feeds ≤ 4 chunks × ≤ 800 chars (~1.2k tokens) plus a short instruction
into a 2048-token context; generation is capped (≤ 256 tokens for answers) so
worst-case CPU latency stays bounded. Qwen's 32k context is intentionally unused.

## Risks accepted at Gate 3A

1. ~4 tok/s CPU generation → answers take tens of seconds; acceptable for local
   single-user Q&A, surfaced via a loading state; shorter caps for extraction
   fields. Recorded as a performance note, not a blocker.
2. 1.5B reasoning ceiling → mitigated by deterministic extraction first,
   schema-enforced output, evidence-only prompting and refusal behavior
   (verified in Phase 3B tests).
3. Embedding conversion provenance (Xenova ONNX of the MIT model) is pinned by
   SHA-256 manifest, same pattern as the Phase 1 CT2 snapshot.
