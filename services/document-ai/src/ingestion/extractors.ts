/**
 * Local text extractors: text-based PDF (pdfjs-dist), plain text, and images
 * (delegated to the OCR provider). Fully offline; nothing here touches the
 * network. Page numbers are preserved end-to-end (ARCHITECTURE.md §8.2).
 *
 * Scanned-PDF limitation (documented): pages without an extractable text layer
 * produce an explicit warning instead of silent empty output; OCR of scanned PDF
 * pages is not supported in this version.
 */

import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { OcrProvider } from "../ocr/index.js";
import type { ExtractedPage } from "./index-store.js";

export interface ExtractionOutput {
  pages: ExtractedPage[];
  warnings: string[];
}

export class ExtractionError extends Error {
  constructor(
    public readonly errorCode:
      "DOCUMENT_PARSE_FAILED" | "UNSUPPORTED_FILE_TYPE" | "FILE_TOO_LARGE" | "OCR_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0\u3000]+/g, " ") // NBSP / ideographic space
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdf(filePath: string, maxPages: number): Promise<ExtractionOutput> {
  const data = new Uint8Array(await readFile(filePath));
  // pdfjs-dist v6 removed script evaluation entirely, so untrusted embedded JS
  // can never execute during extraction.
  const loadingTask = getDocument({ data, useSystemFonts: true });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw new ExtractionError(
      "DOCUMENT_PARSE_FAILED",
      `The PDF could not be parsed: ${(error as Error).message ?? "unknown error"}`,
    );
  }
  try {
    if (pdf.numPages > maxPages) {
      throw new ExtractionError(
        "FILE_TOO_LARGE",
        `The PDF has ${pdf.numPages} pages; the limit is ${maxPages}.`,
      );
    }
    const pages: ExtractedPage[] = [];
    const warnings: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str;
          if (item.hasEOL) text += "\n";
          else text += " ";
        }
      }
      const normalized = normalizeText(text);
      if (normalized.length === 0) {
        warnings.push(
          `Page ${pageNumber} has no extractable text (it may be scanned). ` +
            "OCR of scanned PDF pages is not supported in this version.",
        );
      }
      pages.push({
        pageNumber,
        text: normalized,
        extractionMethod: "pdf-text",
        ocrConfidence: null,
      });
    }
    return { pages, warnings };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function extractTxt(filePath: string): Promise<ExtractionOutput> {
  const buffer = await readFile(filePath);
  // TXT ingestion accepts UTF-8 only; other encodings are reported, not guessed.
  const text = buffer.toString("utf-8");
  if (text.includes("�")) {
    throw new ExtractionError(
      "DOCUMENT_PARSE_FAILED",
      "The text file is not valid UTF-8. Save it as UTF-8 and upload it again.",
    );
  }
  return {
    pages: [
      { pageNumber: 1, text: normalizeText(text), extractionMethod: "txt", ocrConfidence: null },
    ],
    warnings: [],
  };
}

export async function extractImage(
  filePath: string,
  languageHint: string,
  ocr: OcrProvider,
): Promise<ExtractionOutput> {
  const result = await ocr.extractText(filePath, languageHint as never);
  if (!result.ok) {
    throw new ExtractionError("OCR_FAILED", result.message);
  }
  const warnings: string[] = [];
  const pages: ExtractedPage[] = result.value.map((page) => ({
    pageNumber: page.pageNumber,
    text: normalizeText(page.text),
    extractionMethod: "ocr" as const,
    ocrConfidence: page.confidence ?? null,
  }));
  for (const page of pages) {
    if (page.ocrConfidence !== null && page.ocrConfidence < 60) {
      warnings.push(
        `OCR confidence for page ${page.pageNumber} is low (${Math.round(page.ocrConfidence)}%). ` +
          "Check the extracted text against the original image.",
      );
    }
  }
  return { pages, warnings };
}
