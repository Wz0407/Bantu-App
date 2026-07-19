/**
 * Provider registry wiring. Phase 2 provides real ingestion and OCR; the
 * Phase 3 providers (embeddings, LLM, retrieval, citations) remain honest
 * NotConfigured placeholders until their phase.
 */

import path from "node:path";
import type { ServiceConfig } from "../config.js";
import { IndexStore } from "../ingestion/index-store.js";
import { LocalIngestionService } from "../ingestion/service.js";
import { TesseractOcrProvider } from "../ocr/tesseract-provider.js";
import type { DocumentIngestionService } from "../ingestion/index.js";
import type { OcrProvider } from "../ocr/index.js";
import type { EmbeddingProvider } from "../embeddings/index.js";
import type { LocalLlmProvider } from "../generation/index.js";
import type { DocumentRetriever } from "../retrieval/index.js";
import type { CitationGenerator } from "../citations/index.js";
import {
  NotConfiguredCitationGenerator,
  NotConfiguredDocumentRetriever,
  NotConfiguredEmbeddingProvider,
  NotConfiguredLocalLlmProvider,
} from "./not-configured.js";

export interface ProviderRegistry {
  ingestion: DocumentIngestionService;
  ocr: OcrProvider;
  embeddings: EmbeddingProvider;
  llm: LocalLlmProvider;
  retriever: DocumentRetriever;
  citations: CitationGenerator;
}

export function createRegistry(config: ServiceConfig, store: IndexStore): ProviderRegistry {
  const ocr = new TesseractOcrProvider(path.join(config.modelsDir, "ocr"));
  return {
    ingestion: new LocalIngestionService(config, ocr, store),
    ocr,
    embeddings: new NotConfiguredEmbeddingProvider(),
    llm: new NotConfiguredLocalLlmProvider(),
    retriever: new NotConfiguredDocumentRetriever(),
    citations: new NotConfiguredCitationGenerator(),
  };
}
