/**
 * Local persistence for extraction artifacts (pages + chunks), one directory per
 * document under <dataDir>/indexes/<documentId>/. Deleting a document removes the
 * whole directory (FR-04: derived data must not outlive the original).
 *
 * Document IDs are validated against a strict pattern before being used in paths —
 * a document ID is external input and must never traverse the filesystem.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentChunk } from "../chunking/index.js";

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function isValidDocumentId(documentId: string): boolean {
  return DOCUMENT_ID_PATTERN.test(documentId);
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  extractionMethod: "pdf-text" | "txt" | "ocr";
  ocrConfidence: number | null;
}

export interface ExtractionArtifact {
  documentId: string;
  extractedAtUtc: string;
  pageCount: number;
  detectedLanguage: string;
  detectionConfidence: number;
  warnings: string[];
  pages: ExtractedPage[];
  chunks: DocumentChunk[];
}

export class IndexStore {
  constructor(private readonly dataDir: string) {}

  private documentDir(documentId: string): string {
    if (!isValidDocumentId(documentId)) {
      throw new Error(`Invalid document id: ${JSON.stringify(documentId)}`);
    }
    return path.join(this.dataDir, "indexes", documentId);
  }

  async saveExtraction(artifact: ExtractionArtifact): Promise<void> {
    const dir = this.documentDir(artifact.documentId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "extraction.json"), JSON.stringify(artifact, null, 2), "utf-8");
  }

  async loadExtraction(documentId: string): Promise<ExtractionArtifact | null> {
    try {
      const raw = await readFile(
        path.join(this.documentDir(documentId), "extraction.json"),
        "utf-8",
      );
      return JSON.parse(raw) as ExtractionArtifact;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** Removes every derived artifact for the document. Idempotent. */
  async deleteDocumentArtifacts(documentId: string): Promise<void> {
    await rm(this.documentDir(documentId), { recursive: true, force: true });
  }
}
