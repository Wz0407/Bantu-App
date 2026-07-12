import type {
  ErrorResponse,
  HealthStatus,
  TranslationRequest,
  TranslationResponse,
} from "@mybantu/shared-types";

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

async function parseError(response: Response): Promise<never> {
  let error: ErrorResponse;
  try {
    error = (await response.json()) as ErrorResponse;
  } catch {
    error = {
      code: "INTERNAL_ERROR",
      message: "The local API returned an unexpected response. You can retry.",
      retryable: true,
    };
  }
  throw new ApiError(error);
}

export async function getHealth(fetchImpl: FetchLike = fetch): Promise<HealthStatus> {
  const response = await fetchImpl("/health", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as HealthStatus;
}

export async function postTranslation(
  request: TranslationRequest,
  fetchImpl: FetchLike = fetch,
): Promise<TranslationResponse> {
  const response = await fetchImpl("/api/v1/translations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as TranslationResponse;
}
