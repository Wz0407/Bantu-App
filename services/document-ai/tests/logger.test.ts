import { describe, expect, it } from "vitest";
import { createLogger, sanitizeFields, type LogEntry } from "../src/logger.js";

describe("structured logger privacy allowlist", () => {
  it("keeps only allowlisted diagnostic fields", () => {
    const fields = sanitizeFields({
      operation: "ingest",
      durationMs: 12,
      documentId: "doc-1",
      // Fields below must be dropped: they could carry document content or PII.
      documentText: "Amount due: RM426.50",
      question: "What is the deadline?",
      customerName: "Ali",
      absolutePath: "C:\\Users\\someone\\letter.pdf",
    });
    expect(fields).toEqual({ operation: "ingest", durationMs: 12, documentId: "doc-1" });
  });

  it("emits sanitized entries through the sink", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));
    logger.info("processed", { operation: "ocr", pageCount: 3, fullText: "secret content" });
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.level).toBe("info");
    expect(entry.fields).toEqual({ operation: "ocr", pageCount: 3 });
    expect(JSON.stringify(entry)).not.toContain("secret content");
  });
});
