#!/usr/bin/env python3
"""Install local OCR language data for MyBantu (one-time, requires internet).

Downloads Tesseract `tessdata_fast` traineddata (Apache 2.0) for:
  eng      English
  msa      Malay
  chi_sim  Simplified Chinese

into <modelsDir>/ocr (default models/ocr) and writes ocr-manifest.json with
SHA-256 hashes. After installation, OCR runs fully offline — the runtime never
downloads language data.
"""

import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = REPO_ROOT / "models" / "ocr"
BASE_URL = "https://github.com/tesseract-ocr/tessdata_fast/raw/main"
LANGS = ["eng", "msa", "chi_sim"]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    target.mkdir(parents=True, exist_ok=True)
    files = {}
    for lang in LANGS:
        dest = target / f"{lang}.traineddata"
        if not dest.exists():
            url = f"{BASE_URL}/{lang}.traineddata"
            print(f"downloading {url} ...")
            urllib.request.urlretrieve(url, dest)
        files[dest.name] = {"size": dest.stat().st_size, "sha256": sha256_of(dest)}
        print(f"  {dest.name}: {files[dest.name]['size']} bytes")
    manifest = {
        "source": "tesseract-ocr/tessdata_fast",
        "licence": "Apache-2.0",
        "createdUtc": datetime.now(timezone.utc).isoformat(),
        "files": files,
    }
    (target / "ocr-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"OCR language data installed in {target}. OCR now runs fully offline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
