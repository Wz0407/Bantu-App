import type { SupportedLanguage } from "@mybantu/shared-types";

/** Chunk shape fixed by ARCHITECTURE.md §8.2. Page metadata must never be discarded. */
export interface DocumentChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  language: SupportedLanguage | "unknown";
}
