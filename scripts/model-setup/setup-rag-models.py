#!/usr/bin/env python3
"""Install the MyBantu local RAG models (one-time, requires internet).

Downloads into <modelsDir> (default ./models):
  embeddings/multilingual-e5-small/   intfloat/multilingual-e5-small ONNX (MIT)
                                      — quantized int8 encoder + tokenizer
  llm/qwen2.5-1.5b-instruct-q4/       Qwen/Qwen2.5-1.5B-Instruct-GGUF q4_k_m
                                      (Apache 2.0, official Qwen conversion)

Writes a manifest with SHA-256 hashes next to each model. After installation the
RAG pipeline runs fully offline (transformers.js is configured with
allowRemoteModels=false and node-llama-cpp loads the local GGUF file).
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS = REPO_ROOT / "models"

# Xenova/multilingual-e5-small is the transformers.js-ready ONNX conversion of
# intfloat/multilingual-e5-small (MIT); provenance recorded in the manifest.
EMBED_REPO = "Xenova/multilingual-e5-small"
EMBED_DIR = MODELS / "embeddings" / "multilingual-e5-small"
EMBED_FILES = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "onnx/model_int8.onnx",
]

LLM_REPO = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
LLM_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
LLM_DIR = MODELS / "llm" / "qwen2.5-1.5b-instruct-q4"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(directory: Path, meta: dict, files: list[Path]) -> None:
    manifest = {
        **meta,
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "files": {
            str(f.relative_to(directory)).replace("\\", "/"): {
                "size": f.stat().st_size,
                "sha256": sha256_of(f),
            }
            for f in files
        },
    }
    (directory / "model-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"manifest written: {directory / 'model-manifest.json'}")


def main() -> int:
    from huggingface_hub import hf_hub_download

    print(f"Downloading embedding model {EMBED_REPO} ...")
    embed_paths = []
    for name in EMBED_FILES:
        local = hf_hub_download(EMBED_REPO, name)
        target = EMBED_DIR / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(Path(local).read_bytes())
        embed_paths.append(target)
    write_manifest(
        EMBED_DIR,
        {
            "modelVersion": "multilingual-e5-small-onnx-int8/v1",
            "model": "intfloat/multilingual-e5-small",
            "conversionSource": EMBED_REPO,
            "format": "onnx (int8)",
            "licence": "MIT",
            "dimensions": 384,
        },
        embed_paths,
    )

    print(f"Downloading local LLM {LLM_REPO} / {LLM_FILE} (~1.1 GB) ...")
    local = hf_hub_download(LLM_REPO, LLM_FILE)
    LLM_DIR.mkdir(parents=True, exist_ok=True)
    target = LLM_DIR / LLM_FILE
    if not target.exists() or target.stat().st_size != Path(local).st_size:
        target.write_bytes(Path(local).read_bytes())
    write_manifest(
        LLM_DIR,
        {
            "modelVersion": "qwen2.5-1.5b-instruct-q4_k_m/v1",
            "model": LLM_REPO,
            "format": "gguf",
            "quantization": "Q4_K_M",
            "licence": "Apache-2.0",
        },
        [target],
    )
    print("Done. The RAG pipeline can now run fully offline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
