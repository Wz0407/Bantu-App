/**
 * Phase 0 placeholder adapters.
 *
 * Every adapter reports NotConfigured and fails explicitly. None of them ever
 * returns a fake AI result (Phase 0 quality requirement).
 */

import type { ServiceAvailability } from "@mybantu/shared-types";
import { notConfiguredFailure, type ProviderResult } from "../common.js";
import type { DocumentIngestionService, IngestionResult } from "../ingestion/index.js";
import type { OcrPage, OcrProvider } from "../ocr/index.js";
import type { EmbeddingProvider } from "../embeddings/index.js";
import type { LocalLlmProvider } from "../generation/index.js";
import type { DocumentRetriever } from "../retrieval/index.js";
import type { Citation, CitationGenerator } from "../citations/index.js";
import type { DocumentChunk } from "../chunking/index.js";

const NOT_CONFIGURED: ServiceAvailability = "NotConfigured";

export class NotConfiguredIngestionService implements DocumentIngestionService {
  readonly name = "document-ingestion";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  ingest(): Promise<ProviderResult<IngestionResult>> {
    return Promise.resolve(notConfiguredFailure(this.name, "DOCUMENT_PARSE_FAILED"));
  }
}

export class NotConfiguredOcrProvider implements OcrProvider {
  readonly name = "ocr-provider";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  extractText(): Promise<ProviderResult<OcrPage[]>> {
    return Promise.resolve(notConfiguredFailure(this.name, "MODEL_NOT_INSTALLED"));
  }
}

export class NotConfiguredEmbeddingProvider implements EmbeddingProvider {
  readonly name = "embedding-provider";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  embed(): Promise<ProviderResult<number[][]>> {
    return Promise.resolve(notConfiguredFailure(this.name, "MODEL_NOT_INSTALLED"));
  }
}

export class NotConfiguredLocalLlmProvider implements LocalLlmProvider {
  readonly name = "local-llm";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  complete(): Promise<ProviderResult<string>> {
    return Promise.resolve(notConfiguredFailure(this.name, "LOCAL_LLM_UNAVAILABLE"));
  }
  modelVersion(): string | null {
    return null;
  }
}

export class NotConfiguredDocumentRetriever implements DocumentRetriever {
  readonly name = "document-retriever";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  retrieve(): Promise<ProviderResult<DocumentChunk[]>> {
    return Promise.resolve(notConfiguredFailure(this.name, "INDEX_BUILD_FAILED"));
  }
  deleteIndex(): Promise<ProviderResult<void>> {
    return Promise.resolve(notConfiguredFailure(this.name, "INDEX_BUILD_FAILED"));
  }
}

export class NotConfiguredCitationGenerator implements CitationGenerator {
  readonly name = "citation-generator";
  availability(): ServiceAvailability {
    return NOT_CONFIGURED;
  }
  fromChunks(): ProviderResult<Citation[]> {
    return notConfiguredFailure(this.name, "INSUFFICIENT_EVIDENCE");
  }
}

export interface ProviderRegistry {
  ingestion: DocumentIngestionService;
  ocr: OcrProvider;
  embeddings: EmbeddingProvider;
  llm: LocalLlmProvider;
  retriever: DocumentRetriever;
  citations: CitationGenerator;
}

export function createNotConfiguredRegistry(): ProviderRegistry {
  return {
    ingestion: new NotConfiguredIngestionService(),
    ocr: new NotConfiguredOcrProvider(),
    embeddings: new NotConfiguredEmbeddingProvider(),
    llm: new NotConfiguredLocalLlmProvider(),
    retriever: new NotConfiguredDocumentRetriever(),
    citations: new NotConfiguredCitationGenerator(),
  };
}
