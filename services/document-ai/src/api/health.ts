import type { HealthStatus } from "@mybantu/shared-types";
import type { ProviderRegistry } from "../adapters/not-configured.js";
import type { ServiceConfig } from "../config.js";

/**
 * Builds the /internal/v1/health response.
 * The service itself is healthy when it can serve requests; unconfigured AI
 * providers make it "degraded", never silently "healthy".
 */
export function buildHealthStatus(
  config: ServiceConfig,
  providers: ProviderRegistry,
  now: () => Date = () => new Date(),
): HealthStatus {
  const components = (
    [
      providers.ingestion,
      providers.ocr,
      providers.embeddings,
      providers.llm,
      providers.retriever,
      providers.citations,
    ] as const
  ).map((provider) => ({
    name: provider.name,
    availability: provider.availability(),
  }));

  const allAvailable = components.every((c) => c.availability === "Available");
  const anyUnavailable = components.some((c) => c.availability === "Unavailable");

  return {
    status: allAvailable ? "healthy" : anyUnavailable ? "unhealthy" : "degraded",
    service: config.serviceName,
    version: config.serviceVersion,
    timestampUtc: now().toISOString(),
    components,
  };
}
