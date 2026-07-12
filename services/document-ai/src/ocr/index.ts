import type { SupportedLanguage } from "@mybantu/shared-types";
import type { AvailabilityReporting, ProviderResult } from "../common.js";

export interface OcrPage {
  pageNumber: number;
  text: string;
}

/** OCR engines are implemented in Phase 2 behind this interface. */
export interface OcrProvider extends AvailabilityReporting {
  extractText(
    imagePath: string,
    language: SupportedLanguage | "auto",
  ): Promise<ProviderResult<OcrPage[]>>;
}
