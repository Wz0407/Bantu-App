import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { IndexStore, isValidDocumentId } from "../src/ingestion/index-store.js";
import { LocalIngestionService } from "../src/ingestion/service.js";
import { TesseractOcrProvider } from "../src/ocr/tesseract-provider.js";
import { detectLanguage } from "../src/ingestion/detect-language.js";
import { chunkPages } from "../src/chunking/chunker.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const samples = path.join(repoRoot, "data", "samples");

// Isolated data dir per run; fixtures are copied into <dataDir>/documents like the API does.
const tempRoot = mkdtempSync(path.join(tmpdir(), "mybantu-ingest-"));
const documentsDir = path.join(tempRoot, "data", "documents");
mkdirSync(documentsDir, { recursive: true });

const config = loadConfig({
  MYBANTU_DATA_DIR: path.join(tempRoot, "data"),
  MYBANTU_MODELS_DIR: path.join(repoRoot, "models"), // real OCR data when installed
});
const store = new IndexStore(config.dataDir);
const ocr = new TesseractOcrProvider(path.join(config.modelsDir, "ocr"));
const service = new LocalIngestionService(config, ocr, store);

function stage(fixture: string, storedName: string): string {
  const target = path.join(documentsDir, storedName);
  cpSync(path.join(samples, fixture), target);
  return target;
}

afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("PDF ingestion", () => {
  it("extracts a two-page PDF preserving page numbers, amounts and dates", async () => {
    const stored = stage("letters/payment-reminder-en.pdf", "aaaaaaaa-0001.pdf");
    const result = await service.ingest({
      documentId: "doc-en-payment-0001",
      storedFilePath: stored,
      mimeType: "application/pdf",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ready");
    expect(result.value.pageCount).toBe(2);
    expect(result.value.detectedLanguage).toBe("en");
    expect(result.value.chunkCount).toBeGreaterThan(0);

    const artifact = await store.loadExtraction("doc-en-payment-0001");
    expect(artifact).not.toBeNull();
    expect(artifact!.pages[0]!.text).toContain("RM187.45");
    expect(artifact!.pages[0]!.text).toContain("18 July 2026");
    expect(artifact!.pages[1]!.text).toContain("03-8736 1122");
    expect(artifact!.chunks.every((c) => c.pageNumber !== null)).toBe(true);
  });

  it("detects Malay in the school notice PDF", async () => {
    const stored = stage("letters/school-notice-ms.pdf", "aaaaaaaa-0002.pdf");
    const result = await service.ingest({
      documentId: "doc-ms-school-0002",
      storedFilePath: stored,
      mimeType: "application/pdf",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detectedLanguage).toBe("ms");
      const artifact = await store.loadExtraction("doc-ms-school-0002");
      expect(artifact!.pages[0]!.text).toContain("RM25");
    }
  });

  it("rejects a malformed PDF with a machine-readable error", async () => {
    const stored = stage("adversarial/malformed.pdf", "aaaaaaaa-0003.pdf");
    const result = await service.ingest({
      documentId: "doc-bad-pdf-0003",
      storedFilePath: stored,
      mimeType: "application/pdf",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("DOCUMENT_PARSE_FAILED");
  });

  it("rejects a PDF over the configured page limit", async () => {
    const limited = new LocalIngestionService(
      loadConfig({
        MYBANTU_DATA_DIR: path.join(tempRoot, "data"),
        MYBANTU_DOCAI_MAX_PDF_PAGES: "1",
      }),
      ocr,
      store,
    );
    const stored = stage("letters/payment-reminder-en.pdf", "aaaaaaaa-0004.pdf");
    const result = await limited.ingest({
      documentId: "doc-pagelimit-0004",
      storedFilePath: stored,
      mimeType: "application/pdf",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("FILE_TOO_LARGE");
  });
});

describe("TXT ingestion", () => {
  it("extracts UTF-8 Chinese text and detects zh", async () => {
    const stored = stage("letters/simple-letter-zh.txt", "aaaaaaaa-0005.txt");
    const result = await service.ingest({
      documentId: "doc-zh-letter-0005",
      storedFilePath: stored,
      mimeType: "text/plain",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detectedLanguage).toBe("zh");
      const artifact = await store.loadExtraction("doc-zh-letter-0005");
      expect(artifact!.pages[0]!.text).toContain("RM32.80");
    }
  });

  it("rejects an empty file", async () => {
    const stored = stage("adversarial/zero-byte.txt", "aaaaaaaa-0006.txt");
    const result = await service.ingest({
      documentId: "doc-empty-0006",
      storedFilePath: stored,
      mimeType: "text/plain",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("empty");
  });
});

describe("security controls", () => {
  it("rejects stored paths outside the documents directory (traversal defense)", async () => {
    const outside = path.join(tempRoot, "outside.txt");
    writeFileSync(outside, "secret");
    const result = await service.ingest({
      documentId: "doc-traversal-0007",
      storedFilePath: outside,
      mimeType: "text/plain",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("VALIDATION_FAILED");
      expect(result.message).toContain("outside");
    }
  });

  it("rejects traversal sequences in the path", async () => {
    const result = await service.ingest({
      documentId: "doc-traversal-0008",
      storedFilePath: path.join(documentsDir, "..", "..", "outside.txt"),
      mimeType: "text/plain",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported MIME types and invalid document ids", async () => {
    const stored = stage("letters/simple-letter-zh.txt", "aaaaaaaa-0009.txt");
    const badMime = await service.ingest({
      documentId: "doc-badmime-0009",
      storedFilePath: stored,
      mimeType: "application/x-msdownload",
    });
    expect(badMime.ok).toBe(false);
    if (!badMime.ok) expect(badMime.errorCode).toBe("UNSUPPORTED_FILE_TYPE");

    const badId = await service.ingest({
      documentId: "../../etc/passwd",
      storedFilePath: stored,
      mimeType: "text/plain",
    });
    expect(badId.ok).toBe(false);
    if (!badId.ok) expect(badId.errorCode).toBe("VALIDATION_FAILED");
  });

  it("rejects files over the size limit", async () => {
    const small = new LocalIngestionService(
      loadConfig({
        MYBANTU_DATA_DIR: path.join(tempRoot, "data"),
        MYBANTU_DOCAI_MAX_FILE_BYTES: "10",
      }),
      ocr,
      store,
    );
    const stored = stage("letters/simple-letter-zh.txt", "aaaaaaaa-0010.txt");
    const result = await small.ingest({
      documentId: "doc-toobig-0010",
      storedFilePath: stored,
      mimeType: "text/plain",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("FILE_TOO_LARGE");
  });

  it("index store validates document ids and deletes idempotently", async () => {
    expect(isValidDocumentId("valid-doc-12345678")).toBe(true);
    expect(isValidDocumentId("../escape")).toBe(false);
    expect(isValidDocumentId("short")).toBe(false);
    await store.deleteDocumentArtifacts("doc-en-payment-0001");
    await store.deleteDocumentArtifacts("doc-en-payment-0001"); // idempotent
    expect(await store.loadExtraction("doc-en-payment-0001")).toBeNull();
  });
});

describe("language detection heuristic", () => {
  it("classifies en, ms, zh and admits uncertainty", () => {
    expect(detectLanguage("Please pay the amount before the end of the month.").language).toBe(
      "en",
    );
    expect(detectLanguage("Sila jelaskan bayaran anda sebelum hujung bulan ini.").language).toBe(
      "ms",
    );
    expect(detectLanguage("请在月底之前缴清款项。").language).toBe("zh");
    expect(detectLanguage("12345 67890").language).toBe("unknown");
  });
});

describe("chunker", () => {
  it("splits long pages into page-preserving chunks with offsets and stable ids", () => {
    const sentence = "Ayat ini menerangkan perkara penting tentang bayaran. ";
    const text = sentence.repeat(40).trim();
    const chunks = chunkPages(
      "doc-chunk-test-0001",
      [{ pageNumber: 3, text, extractionMethod: "txt", ocrConfidence: null }],
      "ms",
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBe(3);
      expect(chunk.text.length).toBeLessThanOrEqual(800);
      expect(text.slice(chunk.startOffset!, chunk.endOffset!)).toContain(chunk.text.slice(0, 20));
    }
    expect(chunks[0]!.chunkId).toBe("doc-chunk-test-0001:p3:c0");
    // Deterministic: same input, same ids.
    const again = chunkPages(
      "doc-chunk-test-0001",
      [{ pageNumber: 3, text, extractionMethod: "txt", ocrConfidence: null }],
      "ms",
    );
    expect(again.map((c) => c.chunkId)).toEqual(chunks.map((c) => c.chunkId));
  });
});

describe("OCR ingestion (requires local language data; SKIPS honestly when absent)", () => {
  const ocrReady = existsSync(path.join(repoRoot, "models", "ocr", "eng.traineddata"));

  it.skipIf(!ocrReady)(
    "extracts English text and amount from a clean notice image",
    async () => {
      const stored = stage("images/notice-en.png", "aaaaaaaa-0011.png");
      const result = await service.ingest({
        documentId: "doc-ocr-en-00011",
        storedFilePath: stored,
        mimeType: "image/png",
        languageHint: "en",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const artifact = await store.loadExtraction("doc-ocr-en-00011");
        expect(artifact!.pages[0]!.text).toContain("RM45.90");
        expect(artifact!.pages[0]!.extractionMethod).toBe("ocr");
        expect(artifact!.pages[0]!.ocrConfidence).not.toBeNull();
      }
    },
    60_000,
  );

  it.skipIf(!ocrReady)(
    "reports NotInstalled explicitly when a language pack is missing",
    async () => {
      const missing = new TesseractOcrProvider(path.join(tempRoot, "no-ocr-data"));
      const result = await missing.extractText(path.join(samples, "images", "notice-en.png"), "en");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("MODEL_NOT_INSTALLED");
      expect(missing.availability()).toBe("NotInstalled");
    },
  );
});
