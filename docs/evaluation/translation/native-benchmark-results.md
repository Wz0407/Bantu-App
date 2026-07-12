# Native translation benchmark (Phase 1B, real C ABI)

Measured through the production C ABI (`trilingua/0.2.0`, model
`m2m100_418M-ct2-int8/v1`) on this machine — the exact path .NET P/Invoke uses.
Windows x64, CPU-only, **single-threaded INT8** (per the threading decision in
[ADR-008](../../adr/ADR-008-translation-model-and-runtime.md): the multi-threaded
CPU pool deadlocks in this source build, so inference is single-threaded).

## Cold start

- Model + tokenizer load + first call: **2738 ms** (`trilingua_benchmarks <model_dir>`).

## Per-sentence latency (real translations)

Two complementary measurements:

**Short everyday sentences** (from the model CTest suite, wall time incl. ~1–2 s
fresh model load per isolated test process):

| Test (real translation)               | Wall                      |
| ------------------------------------- | ------------------------- |
| All six directions (6 translations)   | 31.1 s (~5 s/sentence)    |
| Chinese round-trip + amount preserved | 9.7 s                     |
| Malay currency/date preserved         | 6.4 s                     |
| Model numbers + error codes preserved | 11.4 s                    |
| Auto-detect + translate               | 9.3 s                     |
| Repeated (10 calls)                   | 37.7 s (~3.8 s/call warm) |

**Longer bill/reminder sentences** (native benchmark, 5 iterations/direction; run was
time-boxed at 200 s and captured 3 of 6 directions before the cap):

| Direction | mean   | best   |
| --------- | ------ | ------ |
| en→ms     | 12.9 s | 11.6 s |
| ms→en     | 10.0 s | 8.8 s  |
| en→zh     | 18.4 s | 15.2 s |

## Interpretation

- **Correctness is verified for all six directions** (native CTest 32/32 with model,
  and .NET P/Invoke 5/5). Amounts, dates, model numbers, error codes, and phone
  numbers are preserved; auto-detection resolves `ms`/`zh`.
- **Single-threaded latency is high** for longer inputs (10–18 s) vs the all-core
  Phase 1A Python figures (0.4–0.8 s, see `benchmark-results.json`). Acceptable for a
  local single-user MVP translating short letters/bills, and recorded as a deferred
  performance item (revisit multi-threading via an OpenMP/oneDNN CTranslate2 build or
  the official prebuilt library in Phase 6 packaging).
- Peak process RSS with the model loaded: ~0.6–0.7 GB (well within the 8 GB target).
