# Phase 1A — Offline translation model and runtime evaluation

Date: 2026-07-12. Sources: official Hugging Face model cards and official runtime
documentation (fetched 2026-07-12), plus measurements on the reference machine
(see `benchmark-results.json`).

Requirement recap: en/ms/zh, all six directions, Windows 10/11 x64, CPU-only,
8 GB RAM minimum target, fully offline after installation, licence must permit
the intended community/commercial use, C++-integrable (ASP.NET Core → C ABI → C++).

## 1. Model candidates

### 1.1 facebook/m2m100_418M — **selected**

| Property                  | Value (from official model card)                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Licence                   | **MIT** — commercial use permitted                                                                                                                                                                                             |
| Parameters                | 418 M                                                                                                                                                                                                                          |
| Languages                 | 101, **including `ms` and `zh`**                                                                                                                                                                                               |
| Directions                | Direct many-to-many: "can directly translate between the 9,900 directions of 100 languages" — **all six MyBantu directions are direct, no pivot**                                                                              |
| Tokenizer                 | SentencePiece (`sentencepiece.bpe.model`) + language tokens (`__en__`, `__ms__`, `__zh__`)                                                                                                                                     |
| Tokenizer C++ feasibility | google/sentencepiece is a first-class C++ library (Apache 2.0)                                                                                                                                                                 |
| Size                      | ~1.9 GB fp32 on disk; ~470 MB as pre-quantized INT8 CTranslate2 model                                                                                                                                                          |
| Quantization              | INT8 supported via CTranslate2 (load-time or convert-time)                                                                                                                                                                     |
| Measured RAM / latency    | see `benchmark-results.json` (measured on this machine)                                                                                                                                                                        |
| GPU                       | optional (CTranslate2 CUDA build); not required                                                                                                                                                                                |
| Known limitations         | 418M-scale quality: adequate for everyday notices/bills, weaker on idiom and long literary text; Malay output can lean formal/Indonesian-influenced in places; colloquial Manglish input degrades gracefully but not perfectly |

### 1.2 facebook/nllb-200-distilled-600M — rejected (licence)

- Licence: **CC-BY-NC 4.0** — the model card states it "is a research model and is
  not released for production deployment"; non-commercial restriction is
  incompatible with MyBantu's intended community/small-business use.
- Technically attractive (600M, strong ms/zh, CTranslate2-supported), but the
  licence is disqualifying. Not selected.

### 1.3 Helsinki-NLP OPUS-MT (MarianMT) — rejected (Malay coverage)

- Licence: per-model, e.g. `opus-mt-en-zh` is Apache 2.0. Runs well under both
  Marian-NMT and CTranslate2.
- **No `opus-mt-en-ms` / `en-zsm` model exists** (verified by search on the official
  hub, 2026-07-12). English↔Malay would require a nonstandard community model or a
  multi-hop pivot, and ms↔zh would always pivot through English (two decode passes,
  compounding errors and doubling latency). Six directions would need 4–6 separate
  model files with inconsistent quality. Rejected for coverage/fragmentation.

### 1.4 google/madlad400-3b-mt — rejected (hardware target)

- Licence: Apache 2.0. Covers 400+ languages; ~11.8 GB fp32 on disk, 3 B parameters.
- Even at INT8 (~3 GB weights) plus KV/activation overhead, running alongside the
  browser, ASP.NET Core, and the Document AI service exceeds the 8 GB minimum
  target, and CPU latency at 3 B parameters is multiple seconds per sentence.
  Documented as a possible future quality upgrade for 16 GB+ machines; rejected
  for the MVP baseline.

## 2. Runtime candidates

### 2.1 CTranslate2 — **selected**

- Licence: **MIT**. Purpose-built C++ inference engine for Transformer translation
  models; official converter and documented usage for **M2M-100** (also NLLB and
  Marian, keeping the model swappable behind our adapter — FR-06).
- x86-64 CPU with oneDNN/OpenBLAS/Ruy backends; INT8/INT16/FP16 quantization;
  C++ API; optional CUDA. Windows supported (official Python wheels are Windows
  x64; the C++ library builds with MSVC).
- Tokenization stays outside the runtime → pairs with the SentencePiece C++ library.

### 2.2 ONNX Runtime — not selected for translation

- Licence MIT, excellent general runtime — but seq2seq translation requires either
  exporting encoder/decoder/past-KV graphs and re-implementing beam search in C++,
  or relying on ORT's BeamSearch contrib op, which is brittle for M2M-100-class
  models. CTranslate2 provides translation-specific decoding (beam, prefix
  constraints, length penalties) out of the box with better CPU throughput for this
  model family. ARCHITECTURE.md names ONNX Runtime illustratively; ADR-008 records
  this substitution (the C ABI and adapter interfaces are unchanged).
- ONNX Runtime remains the plan for Phase 3 _embeddings_ (encoder-only models,
  where it is the natural fit).

### 2.3 Marian-NMT — not selected

- MIT, fast C++ — but only runs Marian-format models, which reintroduces the
  OPUS-MT Malay-coverage problem. Rejected with its model family.

### 2.4 llama.cpp (LLM-as-translator) — not selected for Phase 1

- Instruction-tuned LLMs can translate, but at equal quality they are larger and
  slower than a dedicated NMT model, and output format control (no added
  commentary) is weaker. A local LLM arrives in Phase 3 for grounded generation;
  translation stays on the dedicated NMT engine.

## 3. Decision summary

**facebook/m2m100_418M (MIT) on CTranslate2 (MIT), INT8, with the SentencePiece C++
tokenizer (Apache 2.0).** All six directions direct (no pivot). Full rationale,
packaging, verification, and failure behavior in
[ADR-008](../../adr/ADR-008-translation-model-and-runtime.md).

## 4. Measured evidence

`benchmark-results.json` (generated by `benchmark_translation.py` on the reference
machine, INT8, beam 2): cold start 1.04 s; peak RSS 737 MB (delta 523 MB); median
sentence latency 420–763 ms depending on direction; long paragraphs ≈ 2.2 s; strict
must-preserve rate 87% (73/84) with most misses being benign locale reformatting —
all amounts, invoice/model numbers, error codes, and phone numbers survived.
Manual review found three genuine quality issues, recorded in ADR-008: one dropped
trailing sentence (en→zh), Malay names transliterated into Chinese script, and the
Malaysian-Chinese loanword 巴刹 mistranslated. Headline numbers are copied into
ADR-008. Human adequacy/fluency ratings per MVP_SCOPE §9 remain a manual follow-up;
the harness validates feasibility, not final quality.

## 5. Known limitations (candidate-independent)

- 418M-parameter quality ceiling — mitigated by the adapter design: the CT2 format
  also runs NLLB/Marian-class models, so a licence-compatible stronger model can be
  swapped in without touching the C ABI.
- `auto` source detection is not part of M2M-100; Phase 1B implements a
  deterministic heuristic detector (script ratio + stopword profile) that returns
  the detected language and a low-confidence warning band.
- Manglish/colloquial input is out-of-distribution; the dataset includes robustness
  cases and the UI surfaces warnings rather than pretending fidelity.
