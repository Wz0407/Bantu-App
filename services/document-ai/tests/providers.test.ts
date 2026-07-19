import { describe, expect, it } from "vitest";
import {
  NotConfiguredCitationGenerator,
  NotConfiguredDocumentRetriever,
  NotConfiguredEmbeddingProvider,
  NotConfiguredLocalLlmProvider,
} from "../src/adapters/not-configured.js";

describe("Phase 3 NotConfigured placeholders", () => {
  it("never fake AI results: every operation fails explicitly", async () => {
    const embeddings = new NotConfiguredEmbeddingProvider();
    const llm = new NotConfiguredLocalLlmProvider();
    const retriever = new NotConfiguredDocumentRetriever();
    const citations = new NotConfiguredCitationGenerator();

    const results = await Promise.all([
      embeddings.embed(),
      llm.complete(),
      retriever.retrieve(),
      retriever.deleteIndex(),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain("not configured");
    }
    expect(citations.fromChunks().ok).toBe(false);
    expect(llm.modelVersion()).toBeNull();
  });

  it("reports NotConfigured availability with stable error codes", async () => {
    const llm = new NotConfiguredLocalLlmProvider();
    expect(llm.availability()).toBe("NotConfigured");
    const result = await llm.complete();
    if (!result.ok) expect(result.errorCode).toBe("LOCAL_LLM_UNAVAILABLE");
  });
});
