/**
 * HTTP server factory for the internal Document AI API. Split from the entry
 * point so tests can start it on an ephemeral port and exercise the real
 * D1 hardening: bounded bodies, malformed-JSON handling, and timeouts.
 */

import { createServer, type Server } from "node:http";
import type { ServiceConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { IndexStore } from "../ingestion/index-store.js";
import { handleRequest } from "./router.js";

export function createDocumentAiServer(
  config: ServiceConfig,
  logger: Logger,
  providers: ProviderRegistry,
  store: IndexStore,
): Server {
  const server = createServer((req, res) => {
    const started = Date.now();

    const respond = (statusCode: number, body: unknown) => {
      if (res.writableEnded) return;
      res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      logger.info("request", {
        operation: `${req.method} ${req.url?.split("?")[0] ?? "/"}`,
        status: statusCode,
        durationMs: Date.now() - started,
      });
    };

    // Per-request processing timeout (ingestion can be slow, but never unbounded).
    const timeout = setTimeout(() => {
      respond(503, {
        code: "INTERNAL_ERROR",
        message: "The request timed out. The document was not indexed; you can retry.",
        retryable: true,
      });
    }, config.requestTimeoutMs);

    const chunks: Buffer[] = [];
    let received = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > config.maxJsonBodyBytes) {
        aborted = true;
        clearTimeout(timeout);
        respond(413, {
          code: "VALIDATION_FAILED",
          message: `The request body exceeds the ${config.maxJsonBodyBytes}-byte limit.`,
          retryable: false,
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (aborted) return;
      let body: unknown = undefined;
      if (chunks.length > 0) {
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        } catch {
          clearTimeout(timeout);
          respond(400, {
            code: "VALIDATION_FAILED",
            message: "The request body is not valid JSON.",
            retryable: false,
          });
          return;
        }
      }
      handleRequest(req.method ?? "GET", req.url ?? "/", body, config, providers, store)
        .then(({ statusCode, body: responseBody }) => respond(statusCode, responseBody))
        .catch(() => {
          logger.error("request failed", {
            operation: `${req.method} ${req.url?.split("?")[0] ?? "/"}`,
            errorCode: "INTERNAL_ERROR",
            status: 500,
          });
          respond(500, {
            code: "INTERNAL_ERROR",
            message: "The request failed unexpectedly. No data was changed. You can retry.",
            retryable: true,
          });
        })
        .finally(() => clearTimeout(timeout));
    });

    req.on("error", () => {
      clearTimeout(timeout);
      if (!res.writableEnded) res.destroy();
    });
  });

  // Slow-client protection (D1): bound header wait and socket idle time.
  server.headersTimeout = 10_000;
  server.requestTimeout = config.requestTimeoutMs + 10_000;
  return server;
}
