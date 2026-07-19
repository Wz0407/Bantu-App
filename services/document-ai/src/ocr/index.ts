import type { SupportedLanguage } from "@mybantu/shared-types";
import type { AvailabilityReporting, ProviderResult } from "../common.js";

export interface OcrPage {
  pageNumber: number;
  text: string;
  /** Mean recognition confidence 0–100 where the engine reports one. */
  confidence?: number;
}

/** OCR engines are replaceable behind this interface (FR-06). */
export interface OcrProvider extends AvailabilityReporting {
  extractText(
    imagePath: string,
    language: SupportedLanguage | "auto",
  ): Promise<ProviderResult<OcrPage[]>>;
}
