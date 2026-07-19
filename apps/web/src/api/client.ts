import type {
  DocumentExtraction,
  DocumentSummary,
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

// --- Documents (UC-02) ---

export async function uploadDocument(
  file: File,
  languageHint: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file, file.name);
  const query = languageHint ? `?languageHint=${encodeURIComponent(languageHint)}` : "";
  const response = await fetchImpl(`/api/v1/documents${query}`, { method: "POST", body: form });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as DocumentSummary;
}

export async function listDocuments(fetchImpl: FetchLike = fetch): Promise<DocumentSummary[]> {
  const response = await fetchImpl("/api/v1/documents", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as DocumentSummary[];
}

export async function getDocumentPages(
  documentId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DocumentExtraction> {
  const response = await fetchImpl(`/api/v1/documents/${encodeURIComponent(documentId)}/pages`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as DocumentExtraction;
}

export async function reprocessDocument(
  documentId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DocumentSummary> {
  const response = await fetchImpl(`/api/v1/documents/${encodeURIComponent(documentId)}/process`, {
    method: "POST",
  });
  if (!response.ok) {
    await parseError(response);
  }
  return (await response.json()) as DocumentSummary;
}

export async function deleteDocument(
  documentId: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await fetchImpl(`/api/v1/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    await parseError(response);
  }
}
