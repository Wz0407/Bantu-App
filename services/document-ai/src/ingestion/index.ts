import type { DocumentProcessingStatus } from "@mybantu/shared-types";
import type { AvailabilityReporting, ProviderResult } from "../common.js";

export interface IngestionRequest {
  documentId: string;
  storedFilePath: string;
  mimeType: string;
  /** Optional source-language hint for OCR ("en" | "ms" | "zh" | "auto"); JSON null is treated as absent. */
  languageHint?: string | null;
}

export interface IngestionResult {
  documentId: string;
  status: DocumentProcessingStatus;
  pageCount: number | null;
  chunkCount: number;
  detectedLanguage: string;
  detectionConfidence: number;
  warnings: string[];
}

/** Document parsing pipeline behind a replaceable interface (FR-06). */
export interface DocumentIngestionService extends AvailabilityReporting {
  ingest(request: IngestionRequest): Promise<ProviderResult<IngestionResult>>;
}
