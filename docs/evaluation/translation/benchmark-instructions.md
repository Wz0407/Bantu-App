# Translation benchmark instructions (Phase 1A harness)

This directory contains the Phase 1A feasibility harness. It is **evaluation tooling,
not production code** — the production path is the C++ TriLingua engine (Phase 1B).

## Prerequisites

- Python 3.10+
- `pip install ctranslate2 sentencepiece huggingface_hub psutil`
- ~2 GB free disk for the model
- Internet access **once** for the model download. The benchmark itself runs fully
  offline afterwards.

## Getting the model

The production model is **facebook/m2m100_418M** (MIT licence) converted to the
CTranslate2 format. Two equivalent routes:

**A. Convert from the official checkpoint (authoritative):**

```bash
pip install transformers torch  # heavy, one-time
ct2-transformers-converter --model facebook/m2m100_418M \
    --output_dir models/translation/m2m100_418M-ct2
```

**B. Download a pre-converted INT8 snapshot (what this benchmark run used):**

```bash
python -c "from huggingface_hub import snapshot_download; \
snapshot_download('jncraton/m2m100_418M-ct2-int8', local_dir='models/translation/m2m100_418M-ct2')"
```

Route B is a community CTranslate2 INT8 conversion of the same official checkpoint
(MIT-tagged, ~470 MB on disk — the packaging target from ADR-008). Provenance is
verified by comparing the snapshot's `sentencepiece.bpe.model` SHA-256 against the
official `facebook/m2m100_418M` release
(`d8f7c76ed2a5e0822be39f0a4f95a55eb19c78f4593ce609e2edbc2aea4d380a`); the benchmark
run recorded a match. The Phase 1B model-setup script offers route A for
authoritative conversion; route B avoids the multi-GB torch toolchain.

## Running

```bash
python docs/evaluation/translation/benchmark_translation.py --compute-type int8
```

Outputs `benchmark-results.json` next to the script: cold-start time, per-direction
latency, peak RSS, and must-preserve token fidelity across the 45-case synthetic
dataset (`translation-test-dataset.json`, six directions).

## What the numbers mean

- **coldStartSeconds** — tokenizer + model load + first tiny translation.
- **latencyMsByDirection** — per-sentence wall-clock translation latency (beam 2).
- **processPeakRssMb / modelRssDeltaMb** — Python-process RSS; the C++ engine avoids
  the Python overhead, so production RAM will be at or below the delta.
- **mustPreserve** — fraction of critical literals (amounts, dates, model numbers,
  phone numbers, error codes) that survive translation unchanged. Failures are
  listed per case in `cases[].mustPreserveMissing` for manual review.

Human adequacy/fluency rating (MVP_SCOPE §9) is a separate manual step; this harness
measures feasibility (latency, RAM, literal preservation), not final quality scores.
