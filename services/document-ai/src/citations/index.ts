import type { AvailabilityReporting, ProviderResult } from "../common.js";
import type { DocumentChunk } from "../chunking/index.js";

export interface Citation {
  documentId: string;
  pageNumber: number | null;
  chunkId: string;
  quote: string;
}

/** Citations must come from real retrieved chunks; fabricating page numbers is forbidden. */
export interface CitationGenerator extends AvailabilityReporting {
  fromChunks(chunks: DocumentChunk[]): ProviderResult<Citation[]>;
}
