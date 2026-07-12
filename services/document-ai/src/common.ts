/**
 * Common provider plumbing shared by all Document AI modules.
 *
 * Phase 0 defines boundaries only. Concrete OCR engines, embedding models,
 * local LLM runtimes, vector stores, and parsing pipelines arrive in Phases 2–3
 * behind these interfaces (FR-06 model abstraction).
 */

import type { ErrorCode, ServiceAvailability } from "@mybantu/shared-types";

/** Explicit failure result; providers never throw across the module boundary. */
export interface ProviderFailure {
  ok: false;
  errorCode: ErrorCode;
  message: string;
}

export type ProviderResult<T> = { ok: true; value: T } | ProviderFailure;

/** Every provider reports honest availability; NotConfigured providers never fake results. */
export interface AvailabilityReporting {
  readonly name: string;
  availability(): ServiceAvailability;
}

export function notConfiguredFailure(providerName: string, errorCode: ErrorCode): ProviderFailure {
  return {
    ok: false,
    errorCode,
    message: `${providerName} is not configured. Install and configure the local model or provider before use.`,
  };
}
