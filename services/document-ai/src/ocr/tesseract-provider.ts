/**
 * Local OCR via tesseract.js (Apache 2.0, WASM — runs entirely in-process).
 *
 * Offline policy: language data (`eng`, `msa`, `chi_sim` .traineddata) must be
 * installed locally under <modelsDir>/ocr by scripts/model-setup. The worker is
 * configured with that local langPath and never falls back to a CDN — a missing
 * traineddata file is an explicit NotInstalled state, not a silent download.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { createWorker } from "tesseract.js";
import type { ServiceAvailability, SupportedLanguage } from "@mybantu/shared-types";
import { notConfiguredFailure, type ProviderResult } from "../common.js";
import type { OcrPage, OcrProvider } from "./index.js";

const LANGUAGE_TO_TESSERACT: Record<SupportedLanguage, string> = {
  en: "eng",
  ms: "msa",
  zh: "chi_sim",
};
const ALL_TESSERACT_LANGS = ["eng", "msa", "chi_sim"];

export class TesseractOcrProvider implements OcrProvider {
  readonly name = "ocr-provider";

  constructor(private readonly ocrDataDir: string) {}

  private installedLanguages(): string[] {
    return ALL_TESSERACT_LANGS.filter((lang) =>
      existsSync(path.join(this.ocrDataDir, `${lang}.traineddata`)),
    );
  }

  availability(): ServiceAvailability {
    return this.installedLanguages().length === ALL_TESSERACT_LANGS.length
      ? "Available"
      : "NotInstalled";
  }

  async extractText(
    imagePath: string,
    language: SupportedLanguage | "auto",
  ): Promise<ProviderResult<OcrPage[]>> {
    const installed = this.installedLanguages();
    const requested = language === "auto" ? ALL_TESSERACT_LANGS : [LANGUAGE_TO_TESSERACT[language]];
    const missing = requested.filter((lang) => !installed.includes(lang));
    if (missing.length > 0) {
      return notConfiguredFailure(
        `${this.name} (missing language data: ${missing.join(", ")} — run scripts/model-setup/setup-ocr-data.py)`,
        "MODEL_NOT_INSTALLED",
      );
    }

    let worker;
    try {
      worker = await createWorker(requested, 1, {
        langPath: this.ocrDataDir,
        cachePath: this.ocrDataDir,
        gzip: false,
      });
      const result = await worker.recognize(imagePath);
      return {
        ok: true,
        value: [
          {
            pageNumber: 1,
            text: result.data.text ?? "",
            confidence: result.data.confidence,
          },
        ],
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: "OCR_FAILED",
        message: `OCR failed: ${(error as Error).message ?? "unknown error"}`,
      };
    } finally {
      await worker?.terminate().catch(() => undefined);
    }
  }
}
