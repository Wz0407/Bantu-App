# ADR-008: Offline translation model and runtime

Status: accepted — 2026-07-12
Related: [translation-model-evaluation.md](../evaluation/translation/translation-model-evaluation.md),
[benchmark-results.json](../evaluation/translation/benchmark-results.json)

## Decision

| Concern      | Decision                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model        | **facebook/m2m100_418M** (MIT)                                                                                                                   |
| Runtime      | **CTranslate2** ≥ 4.8 (MIT), CPU, Ruy/oneDNN backends                                                                                            |
| Tokenizer    | **SentencePiece** C++ library (Apache 2.0) with the model's `sentencepiece.bpe.model` and M2M-100 language tokens (`__en__`, `__ms__`, `__zh__`) |
| Directions   | All six directions **direct** — no pivot translation                                                                                             |
| Quantization | INT8 (convert-time preferred: ~470 MB on disk; load-time `compute_type=int8` accepted for fp32 conversions)                                      |
| GPU          | Not required; optional via a CUDA CTranslate2 build later, no code change                                                                        |

## Context

MVP needs en/ms/zh in all six directions on Windows x64 CPU with 8 GB RAM, fully
offline after installation, with a licence permitting community/commercial use, and
implementable behind the Phase 0 C ABI (React → ASP.NET Core → P/Invoke → C++).

Candidates and rejections (full table in the evaluation doc):

- **NLLB-200-distilled-600M** — CC-BY-NC 4.0, "not released for production
  deployment" → licence-disqualified.
- **OPUS-MT/Marian** — Apache 2.0 but **no en↔ms model exists**; ms↔zh would pivot
  through English; 4–6 model files → coverage-disqualified.
- **MADLAD-400-3B** — Apache 2.0 but 3 B params (~11.8 GB fp32) → exceeds the 8 GB
  CPU-only target.
- **ONNX Runtime** as the translation runtime — rejected for seq2seq: it lacks
  translation-grade decoding (beam/prefix/length control) without substantial custom
  C++; CTranslate2 provides it natively with better CPU throughput for this family.
  ARCHITECTURE.md's "C++ / ONNX Runtime" cell is amended by this ADR for the
  translation engine; ONNX Runtime remains planned for Phase 3 embeddings. The C ABI
  and adapter boundaries are unchanged.

## Tokenizer strategy

SentencePiece C++ (`google/sentencepiece`, built via CMake FetchContent alongside
CTranslate2) loads `sentencepiece.bpe.model`. Source sequence:
`[__src__] + pieces + [</s>]`; target prefix `[__tgt__]`; the leading target
language token is stripped before detokenization. This is the officially documented
CTranslate2 M2M-100 contract.

## Source-language detection (`auto`)

M2M-100 requires an explicit source token, so `auto` is resolved by a deterministic
in-engine detector: CJK codepoint ratio → `zh`; otherwise a Malay/English stopword
and orthography profile → `ms`/`en`. The detected language and a confidence band are
returned; low confidence adds a warning rather than silently guessing. This is
testable and offline; a learned language-ID model is a possible later upgrade.

## Model download and verification strategy

- Model files are **never committed** (enforced by `.gitignore`).
- `scripts/model-setup` provides the install path: authoritative route converts
  `facebook/m2m100_418M` with `ct2-transformers-converter --quantization int8`;
  a documented alternative downloads a pre-converted CT2 snapshot.
- After install, a `model-manifest.json` is written next to the model recording
  model name, source, CT2 spec revision, quantization, file list and **SHA-256 of
  every file**. The engine reports the manifest's model version through
  `mb_translation_result.model_version` and the health endpoint; a manifest/file
  mismatch is a `MODEL_LOAD_FAILED`, not a silent fallback.
- Install requires internet **once**; runtime is fully offline (verified per phase).

## Minimum hardware

Windows 10/11 x64 (CI also proves Linux x64), 4 CPU threads recommended,
8 GB RAM minimum (measured peak engine RSS is far below this — see benchmark),
~1 GB disk with the int8 model.

## Failure behavior

Unchanged Phase 0 honesty rules, now with a real engine behind them:

- model directory missing/invalid → `MB_STATUS_ENGINE_NOT_CONFIGURED` /
  `MODEL_NOT_INSTALLED` surfaced through `/health` and the translation endpoint;
- manifest hash mismatch or CT2 load error → `MB_STATUS_MODEL_LOAD_FAILED`;
- unsupported language → `MB_STATUS_UNSUPPORTED_LANGUAGE`;
- invalid UTF-8 → `MB_STATUS_INVALID_UTF8`;
- empty-but-valid translation is distinguishable from failure (resolves deferred
  finding D2 via an explicit empty-string sentinel in the ABI);
- no fake translations, ever; no cloud fallback exists.

## Glossary strategy

Phase 1 boundary: the request/response contracts carry `glossaryId` /
`glossaryTermsApplied` (Phase 0 shape), and the engine preserves critical literals
(amounts, model numbers, error codes) as measured by the must-preserve suite.
User-defined glossary enforcement (constrained decoding via CTranslate2
`target_prefix`/replacement post-pass) is deferred to a later phase and returns a
documented `GLOSSARY_NOT_SUPPORTED` warning if a glossaryId is supplied. This is an
explicit, honest limitation rather than silent acceptance.

## Licence limitations

- M2M-100 418M: MIT — no restrictions relevant to MyBantu.
- CTranslate2: MIT. SentencePiece: Apache 2.0.
- NLLB was rejected specifically because CC-BY-NC would prohibit small-business use.

## Measured evidence (this machine, INT8, beam 2, 45-case dataset)

Full record in `benchmark-results.json`. Headlines (Windows 11 x64, CPU-only,
Python harness — the C++ engine will have less overhead):

- Cold start (tokenizer + model load + first call): **1.04 s**
- Peak process RSS: **737 MB** (delta over baseline **523 MB**) — fits the 8 GB target
- Sentence latency by direction (median): en→ms 583 ms, en→zh 580 ms, ms→en 420 ms,
  ms→zh 478 ms, zh→en 763 ms, zh→ms 511 ms; long paragraphs ≈ 2.2 s
- Must-preserve literal rate: **73/84 = 87%** strict; manual review shows most
  misses are benign locale reformatting (`12:30`→`12.30`, `8月`→"August",
  `RM32.80`→"32.80 RM"). All currency amounts, invoice numbers, product model
  numbers, error codes, and phone numbers were preserved.
- Genuine quality findings recorded for Phase 1B warnings/tests: one dropped
  trailing sentence in an en→zh case; Malay personal names transliterated into
  Chinese script; Malaysian-Chinese loanword 巴刹 ("pasar") mistranslated.
- Provenance: the INT8 snapshot's `sentencepiece.bpe.model` SHA-256
  (`d8f7c76e…4d380a`) exactly matches the official `facebook/m2m100_418M` release.

## Unresolved risks

1. 418M quality ceiling for idiomatic Malay and Manglish — mitigated by warnings and
   the swappable CT2 model format; tracked for post-MVP evaluation.
2. CTranslate2 must be compiled into the native build (no official C++ binary
   distribution) — build feasibility on MSVC was verified in Phase 1A; CI builds it
   from source with caching.
3. Heuristic language detection can misclassify short mixed-language inputs —
   mitigated by explicit source selection in the UI and low-confidence warnings.
4. Model-dependent tests cannot run in cloud CI (no 0.5–2 GB model download there);
   they skip with an explicit reason when the model is absent and run locally —
   recorded so CI green is never misread as model-verified.
