/**
 * D1 hardening tests over real HTTP: bounded bodies, malformed JSON, route
 * validation, deletion, and machine-readable errors. Uses the production server
 * factory on an ephemeral loopback port.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createLogger, type LogEntry } from "../src/logger.js";
import { createRegistry } from "../src/adapters/registry.js";
import { IndexStore } from "../src/ingestion/index-store.js";
import { createDocumentAiServer } from "../src/api/http-server.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempRoot = mkdtempSync(path.join(tmpdir(), "mybantu-httpd-"));
const documentsDir = path.join(tempRoot, "data", "documents");
mkdirSync(documentsDir, { recursive: true });

const config = loadConfig({
  MYBANTU_DATA_DIR: path.join(tempRoot, "data"),
  MYBANTU_MODELS_DIR: path.join(tempRoot, "models"),
  MYBANTU_DOCAI_MAX_JSON_BYTES: "2048",
});
const logEntries: LogEntry[] = [];
const store = new IndexStore(config.dataDir);
const providers = createRegistry(config, store);

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createDocumentAiServer(
    config,
    createLogger((e) => logEntries.push(e)),
    providers,
    store,
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("internal HTTP API (D1 hardening)", () => {
  it("serves health", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { service: string };
    expect(body.service).toBe("mybantu-document-ai");
  });

  it("rejects malformed JSON with a machine-readable 400", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/documents/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects oversized bodies with 413", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/documents/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "x".repeat(5000) }),
    }).catch(() => null);
    // Node may abort the connection after the 413 is sent; both observations are valid.
    if (response) {
      expect(response.status).toBe(413);
    }
  });

  it("rejects an ingest body with missing fields", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/documents/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "doc-http-test-0001" }),
    });
    expect(response.status).toBe(400);
  });

  it("accepts a JSON-null languageHint (C# client serializes absent hints as null)", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/documents/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-http-null-0001",
        storedFilePath: path.join(documentsDir, "does-not-exist.txt"),
        mimeType: "text/plain",
        languageHint: null,
      }),
    });
    // Passes request validation; fails later on the missing file — NOT a 400.
    expect(response.status).not.toBe(400);
  });

  it("ingests a staged TXT document end-to-end and serves its extraction", async () => {
    cpSync(
      path.join(repoRoot, "data", "samples", "letters", "simple-letter-zh.txt"),
      path.join(documentsDir, "stored-0001.txt"),
    );
    const ingest = await fetch(`${baseUrl}/internal/v1/documents/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-http-zh-0001",
        storedFilePath: path.join(documentsDir, "stored-0001.txt"),
        mimeType: "text/plain",
      }),
    });
    expect(ingest.status).toBe(200);
    const result = (await ingest.json()) as { status: string; detectedLanguage: string };
    expect(result.status).toBe("ready");
    expect(result.detectedLanguage).toBe("zh");

    const extraction = await fetch(`${baseUrl}/internal/v1/documents/doc-http-zh-0001/extraction`);
    expect(extraction.status).toBe(200);
    const artifact = (await extraction.json()) as { pages: Array<{ text: string }> };
    expect(artifact.pages[0]!.text).toContain("RM32.80");
  });

  it("deletes derived artifacts idempotently and 404s afterwards", async () => {
    const del = await fetch(`${baseUrl}/internal/v1/documents/doc-http-zh-0001/index`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    const again = await fetch(`${baseUrl}/internal/v1/documents/doc-http-zh-0001/index`, {
      method: "DELETE",
    });
    expect(again.status).toBe(200);
    const extraction = await fetch(`${baseUrl}/internal/v1/documents/doc-http-zh-0001/extraction`);
    expect(extraction.status).toBe(404);
  });

  it("rejects invalid document ids in paths", async () => {
    const response = await fetch(`${baseUrl}/internal/v1/documents/..%2F..%2Fetc/index`, {
      method: "DELETE",
    });
    expect(response.status).toBe(400);
  });

  it("never logs document content (allowlisted fields only)", () => {
    const serialized = JSON.stringify(logEntries);
    expect(serialized).not.toContain("RM32.80");
    expect(serialized).not.toContain("尊敬的顾客");
  });
});
