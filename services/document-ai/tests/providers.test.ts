import { describe, expect, it } from "vitest";
import { createNotConfiguredRegistry } from "../src/adapters/not-configured.js";

const providers = createNotConfiguredRegistry();

describe("NotConfigured placeholder providers", () => {
  it("never fake AI results: every operation fails explicitly", async () => {
    const results = await Promise.all([
      providers.ingestion.ingest({ documentId: "d1", storedFilePath: "x", mimeType: "text/plain" }),
      providers.ocr.extractText("x.png", "en"),
      providers.embeddings.embed(["hello"]),
      providers.llm.complete({ evidence: [], instruction: "summarise", outputLanguage: "en" }),
      providers.retriever.retrieve({ documentId: "d1", query: "q", topK: 3 }),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBeTruthy();
        expect(result.message).toContain("not configured");
      }
    }
    const citations = providers.citations.fromChunks([]);
    expect(citations.ok).toBe(false);
  });

  it("reports NotConfigured availability everywhere", () => {
    for (const provider of Object.values(providers)) {
      expect(provider.availability()).toBe("NotConfigured");
    }
  });

  it("uses stable error codes from the shared catalogue", async () => {
    const ocr = await providers.ocr.extractText("x.png", "en");
    if (!ocr.ok) expect(ocr.errorCode).toBe("MODEL_NOT_INSTALLED");
    const llm = await providers.llm.complete({
      evidence: [],
      instruction: "summarise",
      outputLanguage: "ms",
    });
    if (!llm.ok) expect(llm.errorCode).toBe("LOCAL_LLM_UNAVAILABLE");
    expect(providers.llm.modelVersion()).toBeNull();
  });
});
