#!/usr/bin/env python3
"""MyBantu Phase 1A translation feasibility benchmark (evaluation harness, NOT production code).

Runs the synthetic evaluation dataset through a CTranslate2-converted M2M-100 418M
model on CPU, measuring cold-start time, per-direction latency, peak RSS, and
must-preserve token fidelity. Results are written to benchmark-results.json.

Usage:
    python benchmark_translation.py [--model-dir PATH] [--compute-type int8]

The model directory must contain a CTranslate2 conversion of facebook/m2m100_418M
(model.bin, config.json, shared_vocabulary.json, sentencepiece.bpe.model).
See benchmark-instructions.md for the download/conversion steps.
"""

import argparse
import json
import platform
import statistics
import sys
import time
from pathlib import Path

import ctranslate2
import psutil
import sentencepiece as spm

HERE = Path(__file__).parent
DATASET = HERE / "translation-test-dataset.json"
RESULTS = HERE / "benchmark-results.json"

LANG_TOKEN = {"en": "__en__", "ms": "__ms__", "zh": "__zh__"}


def load_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model-dir", default=str(HERE / "../../../models/translation/m2m100_418M-ct2"))
    p.add_argument("--compute-type", default="int8", choices=["int8", "int16", "float32"])
    p.add_argument("--beam-size", type=int, default=2)
    return p.parse_args()


def rss_mb() -> float:
    return psutil.Process().memory_info().rss / (1024 * 1024)


def main() -> int:
    args = load_args()
    model_dir = Path(args.model_dir).resolve()
    if not (model_dir / "model.bin").exists():
        print(f"ERROR: model.bin not found in {model_dir}. See benchmark-instructions.md.", file=sys.stderr)
        return 2

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    cases = dataset["cases"]

    baseline_mb = rss_mb()
    t0 = time.perf_counter()
    sp = spm.SentencePieceProcessor(model_file=str(model_dir / "sentencepiece.bpe.model"))
    translator = ctranslate2.Translator(
        str(model_dir), device="cpu", compute_type=args.compute_type, inter_threads=1, intra_threads=0
    )
    # Force weight load with a tiny translation (CT2 loads lazily on some paths).
    warm_src = [LANG_TOKEN["en"]] + sp.encode("Hello.", out_type=str) + ["</s>"]
    translator.translate_batch([warm_src], target_prefix=[[LANG_TOKEN["ms"]]], beam_size=1)
    cold_start_s = time.perf_counter() - t0
    loaded_mb = rss_mb()

    results = []
    peak_mb = loaded_mb
    for case in cases:
        src_lang = case["sourceLanguage"]
        if src_lang == "auto":
            src_lang = "en"  # prototype: detection is a Phase 1B concern; Manglish cases are English-script
        src_tok = LANG_TOKEN[src_lang]
        tgt_tok = LANG_TOKEN[case["targetLanguage"]]

        pieces = [src_tok] + sp.encode(case["sourceText"], out_type=str) + ["</s>"]
        t1 = time.perf_counter()
        out = translator.translate_batch(
            [pieces], target_prefix=[[tgt_tok]], beam_size=args.beam_size, max_decoding_length=512
        )
        latency_ms = (time.perf_counter() - t1) * 1000
        hyp = out[0].hypotheses[0]
        translated = sp.decode(hyp[1:] if hyp and hyp[0] == tgt_tok else hyp)

        preserved = [tok for tok in case.get("mustPreserve", []) if tok in translated]
        missing = [tok for tok in case.get("mustPreserve", []) if tok not in translated]
        peak_mb = max(peak_mb, rss_mb())

        results.append(
            {
                "id": case["id"],
                "direction": f"{case['sourceLanguage']}-{case['targetLanguage']}",
                "category": case["category"],
                "sourceChars": len(case["sourceText"]),
                "latencyMs": round(latency_ms, 1),
                "translated": translated,
                "mustPreserveTotal": len(case.get("mustPreserve", [])),
                "mustPreserveHit": len(preserved),
                "mustPreserveMissing": missing,
            }
        )
        print(f"[{case['id']}] {latency_ms:7.1f} ms  preserve {len(preserved)}/{len(case.get('mustPreserve', []))}")

    by_direction = {}
    for r in results:
        by_direction.setdefault(r["direction"], []).append(r["latencyMs"])

    total_preserve = sum(r["mustPreserveTotal"] for r in results)
    hit_preserve = sum(r["mustPreserveHit"] for r in results)

    summary = {
        "dataset": dataset["name"],
        "model": "facebook/m2m100_418M (CTranslate2 conversion)",
        "modelDir": str(model_dir),
        "computeType": args.compute_type,
        "beamSize": args.beam_size,
        "runtime": f"ctranslate2 {ctranslate2.__version__}",
        "environment": {
            "os": platform.platform(),
            "cpu": platform.processor(),
            "physicalCores": psutil.cpu_count(logical=False),
            "logicalCores": psutil.cpu_count(logical=True),
            "totalRamGb": round(psutil.virtual_memory().total / (1024**3), 1),
            "python": platform.python_version(),
        },
        "coldStartSeconds": round(cold_start_s, 2),
        "processBaselineRssMb": round(baseline_mb, 1),
        "processLoadedRssMb": round(loaded_mb, 1),
        "processPeakRssMb": round(peak_mb, 1),
        "modelRssDeltaMb": round(peak_mb - baseline_mb, 1),
        "latencyMsByDirection": {
            d: {
                "n": len(v),
                "mean": round(statistics.mean(v), 1),
                "median": round(statistics.median(v), 1),
                "max": round(max(v), 1),
            }
            for d, v in sorted(by_direction.items())
        },
        "mustPreserve": {
            "total": total_preserve,
            "hit": hit_preserve,
            "rate": round(hit_preserve / total_preserve, 3) if total_preserve else None,
        },
        "cases": results,
    }
    RESULTS.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\ncold start: {summary['coldStartSeconds']}s | peak RSS: {summary['processPeakRssMb']} MB "
          f"(delta {summary['modelRssDeltaMb']} MB) | preserve rate: {summary['mustPreserve']['rate']}")
    print(f"results written to {RESULTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
