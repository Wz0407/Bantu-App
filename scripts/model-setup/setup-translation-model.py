#!/usr/bin/env python3
"""Install the MyBantu offline translation model (one-time, requires internet).

Downloads the CTranslate2 INT8 conversion of facebook/m2m100_418M (MIT licence)
into models/translation/m2m100_418M-ct2 and writes model-manifest.json with
SHA-256 hashes so the native engine can verify and report the model version.

Routes (see ADR-008):
  default        download pre-converted INT8 snapshot (~470 MB)
  --convert      convert from the official facebook/m2m100_418M checkpoint
                 (authoritative; requires `pip install transformers torch`, ~4 GB)

After installation the translation engine runs fully offline.
"""

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = REPO_ROOT / "models" / "translation" / "m2m100_418M-ct2"
SNAPSHOT_REPO = "jncraton/m2m100_418M-ct2-int8"
OFFICIAL_MODEL = "facebook/m2m100_418M"
OFFICIAL_SPM_SHA256 = "d8f7c76ed2a5e0822be39f0a4f95a55eb19c78f4593ce609e2edbc2aea4d380a"
MODEL_VERSION = "m2m100_418M-ct2-int8/v1"

REQUIRED_FILES = ["model.bin", "config.json", "shared_vocabulary.json", "sentencepiece.bpe.model"]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_manifest(model_dir: Path, source: str) -> None:
    files = {}
    for name in REQUIRED_FILES:
        p = model_dir / name
        files[name] = {"size": p.stat().st_size, "sha256": sha256_of(p)}

    spm_sha = files["sentencepiece.bpe.model"]["sha256"]
    if spm_sha != OFFICIAL_SPM_SHA256:
        print(
            f"ERROR: sentencepiece.bpe.model SHA-256 {spm_sha} does not match the official "
            f"{OFFICIAL_MODEL} tokenizer ({OFFICIAL_SPM_SHA256}). Refusing to write manifest.",
            file=sys.stderr,
        )
        sys.exit(1)

    manifest = {
        "modelVersion": MODEL_VERSION,
        "model": OFFICIAL_MODEL,
        "format": "ctranslate2",
        "quantization": "int8",
        "source": source,
        "licence": "MIT",
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "files": files,
        "officialTokenizerSha256": OFFICIAL_SPM_SHA256,
    }
    (model_dir / "model-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(f"manifest written: {model_dir / 'model-manifest.json'}")
    print(f"modelVersion: {MODEL_VERSION}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default=str(DEFAULT_DIR))
    parser.add_argument("--convert", action="store_true", help="convert from the official checkpoint instead of downloading the snapshot")
    parser.add_argument("--manifest-only", action="store_true", help="only (re)write the manifest for an existing model directory")
    args = parser.parse_args()
    model_dir = Path(args.model_dir)

    if not args.manifest_only:
        if args.convert:
            print(f"Converting {OFFICIAL_MODEL} (authoritative route)...")
            subprocess.run(
                [sys.executable, "-m", "ctranslate2.converters.transformers",
                 "--model", OFFICIAL_MODEL, "--output_dir", str(model_dir),
                 "--quantization", "int8", "--copy_files", "sentencepiece.bpe.model", "--force"],
                check=True,
            )
        else:
            print(f"Downloading {SNAPSHOT_REPO} (~470 MB)...")
            from huggingface_hub import snapshot_download
            snapshot_download(SNAPSHOT_REPO, local_dir=str(model_dir))

    missing = [f for f in REQUIRED_FILES if not (model_dir / f).exists()]
    if missing:
        print(f"ERROR: model directory {model_dir} is missing {missing}", file=sys.stderr)
        return 1

    write_manifest(model_dir, "converted-from-official" if args.convert else SNAPSHOT_REPO)
    print("Done. The translation engine can now run fully offline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
