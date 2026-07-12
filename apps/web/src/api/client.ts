import type { ErrorResponse, HealthStatus } from "@mybantu/shared-types";

/**
 * Typed client for the ASP.NET Core API — the only backend the frontend may call
 * (ARCHITECTURE.md ADR-001). All API access goes through this module.
 */

export class ApiError extends Error {
  constructor(public readonly error: ErrorResponse) {
    super(error.message);
    this.name = "ApiError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function getHealth(fetchImpl: FetchLike = fetch): Promise<HealthStatus> {
  const response = await fetchImpl("/health", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse;
    throw new ApiError(error);
  }
  return (await response.json()) as HealthStatus;
}
