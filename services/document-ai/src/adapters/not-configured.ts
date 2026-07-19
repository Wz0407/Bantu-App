/**
 * Honest NotConfigured placeholders for capabilities that arrive in Phase 3
 * (embeddings, local LLM, retrieval, citations). Every adapter reports
 * NotConfigured and fails explicitly; none ever returns a fake AI result.
 * (Ingestion and OCR became real in Phase 2 — see adapters/registry.ts.)
 */

import type { ServiceAvailability } from "@mybantu/shared-types";
import { notConfiguredFailure, type ProviderResult } from "../common.js";
import type { EmbeddingProvider } from "../embeddings/index.js";
import type { LocalLlmProvider } from "../generation/index.js";
import type { DocumentRetriever } from "../retrieval/index.js";
import type { Citation, CitationGenerator } from "../citations/index.js";
import type { DocumentChunk } from "../chunking/index.js";

const NOT_CONFIGURED: ServiceAvailability = "NotConfigured";

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
