import { describe, expect, it } from "vitest";
import { buildHealthStatus } from "../src/api/health.js";
import { handleRequest } from "../src/api/router.js";
import { createNotConfiguredRegistry } from "../src/adapters/not-configured.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({});
const providers = createNotConfiguredRegistry();

describe("health status", () => {
  it("reports degraded while all AI providers are NotConfigured", () => {
    const health = buildHealthStatus(config, providers, () => new Date("2026-07-12T00:00:00Z"));
    expect(health.status).toBe("degraded");
    expect(health.service).toBe("mybantu-document-ai");
    expect(health.timestampUtc).toBe("2026-07-12T00:00:00.000Z");
    expect(health.components).toHaveLength(6);
    for (const component of health.components) {
      expect(component.availability).toBe("NotConfigured");
    }
  });

  it("lists every required provider boundary", () => {
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

describe("internal router", () => {
  it("serves GET /internal/v1/health", () => {
    const response = handleRequest("GET", "/internal/v1/health", config, providers);
    expect(response.statusCode).toBe(200);
  });

  it("returns a machine-readable NOT_FOUND error for unknown routes", () => {
    const response = handleRequest("GET", "/internal/v1/unknown", config, providers);
    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ code: "NOT_FOUND", retryable: false });
  });

  it("does not expose document ingestion routes yet", () => {
    const response = handleRequest("POST", "/internal/v1/documents/ingest", config, providers);
    expect(response.statusCode).toBe(404);
  });
});

describe("configuration", () => {
  it("binds to loopback by default", () => {
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(5210);
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ MYBANTU_DOCUMENT_AI_PORT: "not-a-port" })).toThrow(
      /Invalid MYBANTU_DOCUMENT_AI_PORT/,
    );
  });
});
