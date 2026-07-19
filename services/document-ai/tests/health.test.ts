import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildHealthStatus } from "../src/api/health.js";
import { createRegistry } from "../src/adapters/registry.js";
import { IndexStore } from "../src/ingestion/index-store.js";
import { loadConfig } from "../src/config.js";

// Isolated empty data/models dirs: OCR reports NotInstalled, Phase 3 providers NotConfigured.
const tempRoot = mkdtempSync(path.join(tmpdir(), "mybantu-health-"));
const config = loadConfig({
  MYBANTU_DATA_DIR: path.join(tempRoot, "data"),
  MYBANTU_MODELS_DIR: path.join(tempRoot, "models"),
});
const store = new IndexStore(config.dataDir);
const providers = createRegistry(config, store);

afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("health status (Phase 2 registry)", () => {
  it("reports real ingestion availability and honest OCR NotInstalled without language data", () => {
    const health = buildHealthStatus(config, providers, () => new Date("2026-07-13T00:00:00Z"));
    expect(health.status).toBe("degraded"); // Phase 3 providers still NotConfigured
    const byName = Object.fromEntries(health.components.map((c) => [c.name, c.availability]));
    expect(byName["document-ingestion"]).toBe("Available");
    expect(byName["ocr-provider"]).toBe("NotInstalled");
    expect(byName["embedding-provider"]).toBe("NotConfigured");
    expect(byName["local-llm"]).toBe("NotConfigured");
    expect(byName["document-retriever"]).toBe("NotConfigured");
    expect(byName["citation-generator"]).toBe("NotConfigured");
  });

  it("lists every provider boundary", () => {
    const names = buildHealthStatus(config, providers).components.map((c) => c.name);
    expect(names).toEqual([
      "document-ingestion",
      "ocr-provider",
      "embedding-provider",
      "local-llm",
      "document-retriever",
      "citation-generator",
    ]);
  });
});

describe("configuration", () => {
  it("binds to loopback with hardening defaults", () => {
    expect(config.host).toBe("127.0.0.1");
    expect(config.maxJsonBodyBytes).toBeGreaterThan(0);
    expect(config.maxFileSizeBytes).toBeGreaterThan(0);
    expect(config.maxPdfPages).toBeGreaterThan(0);
    expect(config.requestTimeoutMs).toBeGreaterThan(0);
  });

  it("rejects invalid numeric configuration", () => {
    expect(() => loadConfig({ MYBANTU_DOCUMENT_AI_PORT: "not-a-port" })).toThrow();
    expect(() => loadConfig({ MYBANTU_DOCAI_MAX_JSON_BYTES: "-5" })).toThrow();
  });
});
