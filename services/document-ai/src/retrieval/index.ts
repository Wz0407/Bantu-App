import type { AvailabilityReporting, ProviderResult } from "../common.js";
import type { DocumentChunk } from "../chunking/index.js";

export interface RetrievalRequest {
  documentId: string;
  query: string;
  topK: number;
}

/** Local vector/chunk indexes are implemented in Phase 3 behind this interface (ADR-005). */
export interface DocumentRetriever extends AvailabilityReporting {
  retrieve(request: RetrievalRequest): Promise<ProviderResult<DocumentChunk[]>>;
  deleteIndex(documentId: string): Promise<ProviderResult<void>>;
}
