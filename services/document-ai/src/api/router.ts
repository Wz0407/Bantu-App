import type { ErrorResponse } from "@mybantu/shared-types";
import type { ProviderRegistry } from "../adapters/not-configured.js";
import type { ServiceConfig } from "../config.js";
import { buildHealthStatus } from "./health.js";

export interface RouteResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Minimal internal router. Only /internal/v1/health exists in Phase 0;
 * ingestion/analysis/answer routes are added in Phases 2–3.
 */
export function handleRequest(
  method: string,
  url: string,
  config: ServiceConfig,
  providers: ProviderRegistry,
): RouteResponse {
  const path = url.split("?")[0] ?? "";

  if (method === "GET" && path === "/internal/v1/health") {
    return { statusCode: 200, body: buildHealthStatus(config, providers) };
  }

  const notFound: ErrorResponse = {
    code: "NOT_FOUND",
    message: `No route matches ${method} ${path}. No data was changed. This internal API currently exposes GET /internal/v1/health only.`,
    retryable: false,
  };
  return { statusCode: 404, body: notFound };
}
