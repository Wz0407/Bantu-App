#!/usr/bin/env python3
"""Generate the synthetic MyBantu document fixtures (dev-time tool, run once).

Creates, under data/samples/:
  letters/payment-reminder-en.pdf   (2 pages, text-based, base-14 Helvetica)
  letters/school-notice-ms.pdf      (1 page)
  letters/simple-letter-zh.txt      (UTF-8; zh PDFs are skipped: embedding a CJK
                                     font would redistribute a proprietary font
                                     program — rasterized PNGs cover zh instead)
  images/notice-en.png, notice-ms.png, notice-zh.png          (clean OCR fixtures)
  images/notice-en-degraded.png                                (noise + slight rotate)
  adversarial/malformed.pdf          (invalid PDF bytes)
  adversarial/zero-byte.txt

All content is synthetic. PNG rendering uses locally installed system fonts to
rasterize text (the font program itself is never redistributed).

Requires: pip install pillow
"""

import random
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SAMPLES = ROOT / "data" / "samples"


def build_pdf(pages: list[str]) -> bytes:
    """Minimal valid text PDF with base-14 Helvetica and a correct xref table."""
    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)  # 1-based object number

    font_num_placeholder = 3 + 2 * len(pages)  # catalog, pages, N*(page+content), font
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(pages)))
    add(b"<< /Type /Catalog /Pages 2 0 R >>")
    add(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    for i, text in enumerate(pages):
        content_num = 4 + 2 * i
        add(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_num} 0 R /Resources << /Font << /F1 {font_num_placeholder} 0 R >> >> >>".encode()
        )
        lines = text.split("\n")
        ops = ["BT /F1 12 Tf 72 720 Td 16 TL"]
        for line_index, line in enumerate(lines):
            escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
            ops.append(f"({escaped}) Tj" + (" T*" if line_index < len(lines) - 1 else ""))
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        add(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)


def make_pdfs() -> None:
    letters = SAMPLES / "letters"
    letters.mkdir(parents=True, exist_ok=True)
    (letters / "payment-reminder-en.pdf").write_bytes(
        build_pdf(
            [
                "PAYMENT REMINDER\n\nDear customer,\n\n"
                "Your electricity bill for June 2026 is RM187.45.\n"
                "Please pay before 18 July 2026 to avoid a late payment\n"
                "charge of RM10.\n\nAccount number: ACC-2026-8841",
                "Page 2\n\nIf you have already paid, please ignore this letter.\n"
                "For questions call 03-8736 1122 during office hours.\n\n"
                "Thank you,\nSyarikat Elektrik Contoh Sdn Bhd",
            ]
        )
    )
    (letters / "school-notice-ms.pdf").write_bytes(
        build_pdf(
            [
                "NOTIS SEKOLAH\n\nKepada semua ibu bapa,\n\n"
                "Mesyuarat ibu bapa dan guru akan diadakan pada hari Sabtu,\n"
                "22 Ogos 2026 di dewan sekolah bermula jam 9:00 pagi.\n"
                "Sila hadir tepat pada masa. Yuran aktiviti sebanyak RM25\n"
                "perlu dijelaskan sebelum 15 Ogos 2026.\n\nTerima kasih.",
            ]
        )
    )
    (letters / "simple-letter-zh.txt").write_text(
        "通知\n\n尊敬的顾客：\n\n您本月的水费账单为RM32.80，"
        "请在2026年6月25日之前缴清。\n如有疑问，请致电03-9876 5432。\n\n谢谢。\n",
        encoding="utf-8",
    )

    adversarial = SAMPLES / "adversarial"
    adversarial.mkdir(parents=True, exist_ok=True)
    (adversarial / "malformed.pdf").write_bytes(b"%PDF-1.4\nthis is not a real pdf" + b"\x00" * 64)
    (adversarial / "zero-byte.txt").write_bytes(b"")


def make_images() -> None:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    images = SAMPLES / "images"
    images.mkdir(parents=True, exist_ok=True)

    def render(name: str, text: str, font_path: str, size: int = 28, degrade: bool = False) -> None:
        font = ImageFont.truetype(font_path, size)
        img = Image.new("RGB", (900, 320), "white")
        draw = ImageDraw.Draw(img)
        draw.multiline_text((30, 30), text, fill="black", font=font, spacing=10)
        if degrade:
            img = img.rotate(1.5, expand=False, fillcolor="white")
            img = img.filter(ImageFilter.GaussianBlur(0.6))
            pixels = img.load()
            rng = random.Random(42)
            for _ in range(2500):
                x, y = rng.randrange(img.width), rng.randrange(img.height)
                pixels[x, y] = (rng.randrange(120), rng.randrange(120), rng.randrange(120))
        img.save(images / name)

    arial = r"C:\Windows\Fonts\arial.ttf"
    simsun = r"C:\Windows\Fonts\simsun.ttc"
    render(
        "notice-en.png",
        "NOTICE\nWater supply maintenance on 15 August 2026.\nAmount due: RM45.90 before 30 June 2026.",
        arial,
    )
    render(
        "notice-ms.png",
        "NOTIS\nSila jelaskan bayaran RM75.20\nsebelum 5 Ogos 2026. Terima kasih.",
        arial,
    )
    render(
        "notice-zh.png",
        "通知\n请在2026年8月1日前缴清RM88.00。\n谢谢您的合作。",
        simsun,
        size=32,
    )
    render(
        "notice-en-degraded.png",
        "NOTICE\nWater supply maintenance on 15 August 2026.\nAmount due: RM45.90 before 30 June 2026.",
        arial,
        degrade=True,
    )


if __name__ == "__main__":
    make_pdfs()
    make_images()
    total = sum(1 for _ in SAMPLES.rglob("*") if _.is_file())
    print(f"fixtures written under {SAMPLES} ({total} files)")
    _ = zlib  # keep import for future compressed-stream variants
