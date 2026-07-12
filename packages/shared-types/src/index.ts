/**
 * TypeScript mirror of the JSON Schema contracts in `packages/contracts/schemas`.
 * Keep field names identical to the schemas; never rename silently (AGENTS.md §8).
 * Contract version: v1.
 */

/** Languages MyBantu can produce output in. */
export const SUPPORTED_LANGUAGES = ["en", "ms", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Source languages; `auto` is allowed only where detection is permitted. */
export const SOURCE_LANGUAGES = ["en", "ms", "zh", "auto"] as const;
export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

/** Availability of a component. Unconfigured AI must never pretend to be available. */
export const SERVICE_AVAILABILITY = [
  "Available",
  "NotConfigured",
  "NotInstalled",
  "Unavailable",
] as const;
export type ServiceAvailability = (typeof SERVICE_AVAILABILITY)[number];

export type HealthLevel = "healthy" | "degraded" | "unhealthy";

export interface HealthComponent {
  name: string;
  availability: ServiceAvailability;
  /** Optional note. Must never contain document content or secrets. */
  detail?: string;
}

export interface HealthStatus {
  status: HealthLevel;
  service: string;
  version: string;
  timestampUtc: string;
  components: HealthComponent[];
}

/** Stable error codes (AGENTS.md §15). */
export const ERROR_CODES = [
  "MODEL_NOT_INSTALLED",
  "MODEL_LOAD_FAILED",
  "UNSUPPORTED_LANGUAGE",
  "UNSUPPORTED_FILE_TYPE",
  "FILE_TOO_LARGE",
  "DOCUMENT_PARSE_FAILED",
  "OCR_FAILED",
  "INDEX_BUILD_FAILED",
  "INSUFFICIENT_EVIDENCE",
  "NATIVE_ENGINE_UNAVAILABLE",
  "LOCAL_LLM_UNAVAILABLE",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  correlationId?: string;
  details?: Record<string, unknown>;
}

/** Placeholder; document ingestion is implemented in Phase 2. */
export const DOCUMENT_PROCESSING_STATUSES = ["uploaded", "processing", "ready", "failed"] as const;
export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];

/** Placeholder; translation is implemented in Phase 1. */
export interface TranslationRequest {
  text: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: SupportedLanguage;
  glossaryId: string | null;
}

/** Placeholder; until Phase 1 the API returns NATIVE_ENGINE_UNAVAILABLE instead. */
export interface TranslationResponse {
  originalText: string;
  translatedText: string;
  detectedSourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  modelVersion: string;
  processingTimeMs: number;
  warnings: string[];
  glossaryTermsApplied?: string[];
}

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isSourceLanguage(value: string): value is SourceLanguage {
  return (SOURCE_LANGUAGES as readonly string[]).includes(value);
}
