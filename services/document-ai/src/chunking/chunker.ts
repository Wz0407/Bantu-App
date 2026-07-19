/**
 * Page-aware chunking. Chunks never span pages, carry their page number and
 * character offsets within the page, and use stable deterministic IDs so
 * citations remain reproducible across re-runs (Gate C requirement).
 */

import type { SupportedLanguage } from "@mybantu/shared-types";
import type { DocumentChunk } from "./index.js";
import type { ExtractedPage } from "../ingestion/index-store.js";

export interface ChunkingOptions {
  /** Soft maximum chunk size in characters. */
  maxChars: number;
  /** Minimum size before a sentence boundary is accepted as a split point. */
  minChars: number;
}

export const DEFAULT_CHUNKING: ChunkingOptions = { maxChars: 800, minChars: 200 };

const SENTENCE_BOUNDARY = /[.!?。！？；;]\s*/g;

function splitPageText(
  text: string,
  options: ChunkingOptions,
): Array<{ start: number; end: number }> {
  if (text.length <= options.maxChars) {
    return text.length > 0 ? [{ start: 0, end: text.length }] : [];
  }
  const boundaries: number[] = [];
  for (const match of text.matchAll(SENTENCE_BOUNDARY)) {
    boundaries.push(match.index + match[0].length);
  }
  const spans: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(start + options.maxChars, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      // Prefer the last sentence boundary inside the window, if far enough in.
      const candidate = boundaries
        .filter((b) => b > start + options.minChars && b <= hardEnd)
        .pop();
      if (candidate !== undefined) end = candidate;
    }
    spans.push({ start, end });
    start = end;
  }
  return spans;
}

export function chunkPages(
  documentId: string,
  pages: ExtractedPage[],
  language: SupportedLanguage | "unknown",
  options: ChunkingOptions = DEFAULT_CHUNKING,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  for (const page of pages) {
    const spans = splitPageText(page.text, options);
    spans.forEach((span, index) => {
      const text = page.text.slice(span.start, span.end).trim();
      if (text.length === 0) return;
      chunks.push({
        chunkId: `${documentId}:p${page.pageNumber}:c${index}`,
        documentId,
        pageNumber: page.pageNumber,
        sectionTitle: null,
        text,
        startOffset: span.start,
        endOffset: span.end,
        language,
      });
    });
  }
  return chunks;
}
