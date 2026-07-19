/**
 * Local ingestion pipeline: stored file → per-page text (PDF/TXT/OCR) →
 * language detection → page-aware chunks → persisted extraction artifact.
 * Everything runs locally; page metadata is never discarded.
 *
 * Security: the stored file path comes from the trusted ASP.NET Core API, but is
 * still re-validated here (must resolve inside <dataDir>/documents) so a
 * compromised or buggy caller cannot read arbitrary files (defense in depth).
 */

import { stat } from "node:fs/promises";
import path from "node:path";
import type { ServiceAvailability } from "@mybantu/shared-types";
import type { ProviderResult } from "../common.js";
import type { ServiceConfig } from "../config.js";
import type { OcrProvider } from "../ocr/index.js";
import { chunkPages } from "../chunking/chunker.js";
import { detectLanguage } from "./detect-language.js";
import { ExtractionError, extractImage, extractPdf, extractTxt } from "./extractors.js";
import { IndexStore, isValidDocumentId, type ExtractionArtifact } from "./index-store.js";
import type { DocumentIngestionService, IngestionRequest, IngestionResult } from "./index.js";

const SUPPORTED_MIME_TYPES = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg"]);

export class LocalIngestionService implements DocumentIngestionService {
  readonly name = "document-ingestion";

  constructor(
    private readonly config: ServiceConfig,
    private readonly ocr: OcrProvider,
    private readonly store: IndexStore,
  ) {}

  availability(): ServiceAvailability {
    return "Available";
  }

  async ingest(request: IngestionRequest): Promise<ProviderResult<IngestionResult>> {
    if (!isValidDocumentId(request.documentId)) {
      return { ok: false, errorCode: "VALIDATION_FAILED", message: "Invalid document id." };
    }
    if (!SUPPORTED_MIME_TYPES.has(request.mimeType)) {
      return {
        ok: false,
        errorCode: "UNSUPPORTED_FILE_TYPE",
        message: `Unsupported MIME type '${request.mimeType}'. Supported: PDF, PNG, JPEG, plain text.`,
      };
    }

    const documentsRoot = path.resolve(this.config.dataDir, "documents");
    const resolved = path.resolve(request.storedFilePath);
    const relative = path.relative(documentsRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return {
        ok: false,
        errorCode: "VALIDATION_FAILED",
        message: "The stored file path is outside the local documents directory.",
      };
    }

    let fileSize: number;
    try {
      fileSize = (await stat(resolved)).size;
    } catch {
      return {
        ok: false,
        errorCode: "DOCUMENT_PARSE_FAILED",
        message: "The stored document file was not found. Re-upload the document and retry.",
      };
    }
    if (fileSize === 0) {
      return {
        ok: false,
        errorCode: "DOCUMENT_PARSE_FAILED",
        message: "The stored file is empty.",
      };
    }
    if (fileSize > this.config.maxFileSizeBytes) {
      return {
        ok: false,
        errorCode: "FILE_TOO_LARGE",
        message: `The file is ${fileSize} bytes; the ingestion limit is ${this.config.maxFileSizeBytes} bytes.`,
      };
    }

    try {
      const languageHint = request.languageHint ?? "auto";
      const output =
        request.mimeType === "application/pdf"
          ? await extractPdf(resolved, this.config.maxPdfPages)
          : request.mimeType === "text/plain"
            ? await extractTxt(resolved)
            : await extractImage(resolved, languageHint, this.ocr);

      const combinedText = output.pages.map((p) => p.text).join("\n");
      const detection = detectLanguage(combinedText);
      const chunks = chunkPages(request.documentId, output.pages, detection.language);

      const warnings = [...output.warnings];
      if (chunks.length === 0) {
        warnings.push("No text could be extracted from this document.");
      }
      if (detection.language === "unknown" && chunks.length > 0) {
        warnings.push("The document language could not be determined reliably.");
      }

      const artifact: ExtractionArtifact = {
        documentId: request.documentId,
        extractedAtUtc: new Date().toISOString(),
        pageCount: output.pages.length,
        detectedLanguage: detection.language,
        detectionConfidence: detection.confidence,
        warnings,
        pages: output.pages,
        chunks,
      };
      await this.store.saveExtraction(artifact);

      return {
        ok: true,
        value: {
          documentId: request.documentId,
          status: "ready",
          pageCount: output.pages.length,
          chunkCount: chunks.length,
          detectedLanguage: detection.language,
          detectionConfidence: detection.confidence,
          warnings,
        },
      };
    } catch (error) {
      if (error instanceof ExtractionError) {
        return { ok: false, errorCode: error.errorCode, message: error.message };
      }
      return {
        ok: false,
        errorCode: "DOCUMENT_PARSE_FAILED",
        message: `Ingestion failed unexpectedly: ${(error as Error).message ?? "unknown error"}`,
      };
    }
  }
}
