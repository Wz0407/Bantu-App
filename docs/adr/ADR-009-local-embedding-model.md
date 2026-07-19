# ADR-009: Local embedding model and runtime

Status: accepted — 2026-07-19
Related: [rag-feasibility.md](../evaluation/rag/rag-feasibility.md), ADR-010, ADR-011

## Decision

**intfloat/multilingual-e5-small** (MIT), quantized INT8 ONNX, executed locally in
the Document AI service via **@huggingface/transformers** (transformers.js,
Apache 2.0) with `env.allowRemoteModels = false` and a local `env.localModelPath`.

| Property       | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Licence        | MIT (model), Apache 2.0 (runtime)                                               |
| Dimensions     | 384                                                                             |
| Languages      | ~100 (multilingual E5 family), including en/ms/zh                               |
| On-disk size   | ~120 MB quantized ONNX + tokenizer                                              |
| Usage contract | `query: `/`passage: ` prefixes; mean pooling; L2 normalization                  |
| Install        | `scripts/model-setup/setup-rag-models.py` (one-time internet; SHA-256 manifest) |

## Rationale

- The MVP needs multilingual semantic vectors for short chunks of everyday
  documents on CPU within the 8 GB target. e5-small is the smallest widely
  validated multilingual retriever with credible ms/zh quality; 384-dim vectors
  keep the local index tiny.
- transformers.js runs ONNX fully in-process in Node (the service that owns
  ingestion/retrieval per ADR-002), handles tokenization/pooling, and its remote
  loading is disabled after install — offline by configuration, verified by test.
- Rejected: **bge-m3** (MIT, stronger but ~2.2 GB, 1024-dim — heavier than the
  target warrants); **paraphrase-multilingual-MiniLM-L12-v2** (Apache 2.0, similar
  size but generally weaker retrieval than E5 on multilingual benchmarks);
  **ONNX Runtime directly in C#** (would move retrieval out of the Document AI
  service, against ADR-001/002 boundaries).

## Failure behavior

Missing model files → provider reports `NotInstalled` and operations fail with
`MODEL_NOT_INSTALLED`; embedding-model version is recorded in the index metadata
(ADR-011) so a model change invalidates stale indexes instead of silently mixing
vector spaces. Measured latency/RAM in the feasibility record.
