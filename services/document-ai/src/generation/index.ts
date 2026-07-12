import type { SupportedLanguage } from "@mybantu/shared-types";
import type { AvailabilityReporting, ProviderResult } from "../common.js";
import type { DocumentChunk } from "../chunking/index.js";

export interface LlmCompletionRequest {
  /** Delimited evidence; retrieved document text is untrusted and must never override system rules. */
  evidence: DocumentChunk[];
  instruction: string;
  outputLanguage: SupportedLanguage;
}

/** Local LLM runtimes are implemented in Phase 3 behind this interface. */
export interface LocalLlmProvider extends AvailabilityReporting {
  complete(request: LlmCompletionRequest): Promise<ProviderResult<string>>;
  modelVersion(): string | null;
}
