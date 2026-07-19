# ADR-011: Local vector index

Status: accepted — 2026-07-19
Related: ADR-005 (brute-force acceptable), ADR-009, [rag-feasibility.md](../evaluation/rag/rag-feasibility.md)

## Decision

A **per-document JSON vector index** stored next to the extraction artifact
(`data/indexes/<documentId>/vectors.json`), searched with **exact cosine
similarity** in the Document AI service. No vector database.

Index file contents:

- `indexVersion` (format version) and `embeddingModelVersion` (from the ADR-009
  manifest) — a mismatch at query time forces a rebuild instead of mixing spaces;
- one entry per chunk: `chunkId`, `pageNumber`, L2-normalized `vector` (384 floats),
  plus the chunk text reference (chunks live in `extraction.json`).

## Rationale

- MVP scale is a handful of documents × ≤ ~200 chunks each; exact search over a
  few hundred 384-dim vectors is sub-millisecond — an ANN library or vector DB
  would add operational weight for zero benefit (ADR-005).
- Per-document files make FR-04 deletion trivial and verifiable: removing
  `data/indexes/<documentId>/` removes every derived artifact; retrieval is
  structurally scoped to the selected document (Gate C isolation) because only
  that document's index file is ever opened.
- Deterministic persistence (plain JSON) keeps rebuilds reproducible and
  diffable in tests.

## Replaceability

The `DocumentRetriever` interface (Phase 0) is unchanged; swapping in sqlite-vec
or an ANN index later is a contained provider change. Index format changes bump
`indexVersion` and trigger rebuild-on-read.
