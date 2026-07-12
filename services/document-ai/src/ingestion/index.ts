import type { DocumentProcessingStatus } from "@mybantu/shared-types";
import type { AvailabilityReporting, ProviderResult } from "../common.js";

export interface IngestionRequest {
  documentId: string;
  storedFilePath: string;
  mimeType: string;
}

export interface IngestionResult {
  documentId: string;
  status: DocumentProcessingStatus;
  pageCount: number | null;
  chunkCount: number;
}

/** Document parsing pipelines are implemented in Phase 2 behind this interface. */
export interface DocumentIngestionService extends AvailabilityReporting {
  ingest(request: IngestionRequest): Promise<ProviderResult<IngestionResult>>;
}
