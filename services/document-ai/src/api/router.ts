import type { ErrorResponse } from "@mybantu/shared-types";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { ServiceConfig } from "../config.js";
import { isValidDocumentId, type IndexStore } from "../ingestion/index-store.js";
import type { IngestionRequest } from "../ingestion/index.js";
import { buildHealthStatus } from "./health.js";

export interface RouteResponse {
  statusCode: number;
  body: unknown;
}

function error(
  statusCode: number,
  code: ErrorResponse["code"],
  message: string,
  retryable: boolean,
): RouteResponse {
  const body: ErrorResponse = { code, message, retryable };
  return { statusCode, body };
}

function providerErrorStatus(code: string): number {
  switch (code) {
    case "VALIDATION_FAILED":
    case "UNSUPPORTED_FILE_TYPE":
      return 400;
    case "FILE_TOO_LARGE":
      return 413;
    case "MODEL_NOT_INSTALLED":
      return 503;
    default:
      return 422;
  }
}

function isIngestBody(value: unknown): value is IngestionRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["documentId"] === "string" &&
    typeof v["storedFilePath"] === "string" &&
    typeof v["mimeType"] === "string" &&
    // The C# client serializes an absent hint as JSON null; accept both.
    (v["languageHint"] === undefined ||
      v["languageHint"] === null ||
      typeof v["languageHint"] === "string")
  );
}

/**
 * Internal router (loopback only). Routes:
 *   GET    /internal/v1/health
 *   POST   /internal/v1/documents/ingest
 *   GET    /internal/v1/documents/{id}/extraction
 *   DELETE /internal/v1/documents/{id}/index
 */
export async function handleRequest(
  method: string,
  url: string,
  body: unknown,
  config: ServiceConfig,
  providers: ProviderRegistry,
  store: IndexStore,
): Promise<RouteResponse> {
  const pathName = url.split("?")[0] ?? "";

  if (method === "GET" && pathName === "/internal/v1/health") {
    return { statusCode: 200, body: buildHealthStatus(config, providers) };
  }

  if (method === "POST" && pathName === "/internal/v1/documents/ingest") {
    if (!isIngestBody(body)) {
      return error(
        400,
        "VALIDATION_FAILED",
        "The ingest request must contain documentId, storedFilePath and mimeType strings.",
        false,
      );
    }
    const result = await providers.ingestion.ingest(body);
    if (!result.ok) {
      return {
        statusCode: providerErrorStatus(result.errorCode),
        body: {
          code: result.errorCode,
          message: result.message,
          retryable: result.errorCode !== "UNSUPPORTED_FILE_TYPE",
        } satisfies ErrorResponse,
      };
    }
    return { statusCode: 200, body: result.value };
  }

  const extractionMatch = pathName.match(/^\/internal\/v1\/documents\/([^/]+)\/extraction$/);
  if (method === "GET" && extractionMatch) {
    const documentId = decodeURIComponent(extractionMatch[1]!);
    if (!isValidDocumentId(documentId)) {
      return error(400, "VALIDATION_FAILED", "Invalid document id.", false);
    }
    const artifact = await store.loadExtraction(documentId);
    if (artifact === null) {
      return error(404, "NOT_FOUND", "No extraction exists for this document.", false);
    }
    return { statusCode: 200, body: artifact };
  }

  const indexMatch = pathName.match(/^\/internal\/v1\/documents\/([^/]+)\/index$/);
  if (method === "DELETE" && indexMatch) {
    const documentId = decodeURIComponent(indexMatch[1]!);
    if (!isValidDocumentId(documentId)) {
      return error(400, "VALIDATION_FAILED", "Invalid document id.", false);
    }
    await store.deleteDocumentArtifacts(documentId);
    return { statusCode: 200, body: { documentId, deleted: true } };
  }

  return error(
    404,
    "NOT_FOUND",
    `No route matches ${method} ${pathName}. No data was changed.`,
    false,
  );
}
