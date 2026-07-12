/**
 * Structured JSON logger.
 *
 * Privacy rule (AGENTS.md §14): log fields are restricted to an allowlist so that
 * document text, questions, translations, and personal data can never be logged
 * accidentally. Unknown fields are dropped, not printed.
 */

export type LogLevel = "info" | "warn" | "error";

const ALLOWED_FIELDS = [
  "operation",
  "durationMs",
  "status",
  "modelVersion",
  "documentId",
  "pageCount",
  "chunkCount",
  "correlationId",
  "errorCode",
] as const;

export type AllowedField = (typeof ALLOWED_FIELDS)[number];
export type LogFields = Partial<Record<AllowedField, string | number>>;

export interface LogEntry {
  timestampUtc: string;
  level: LogLevel;
  message: string;
  fields: LogFields;
}

export type LogSink = (entry: LogEntry) => void;

export function sanitizeFields(fields: Record<string, unknown>): LogFields {
  const sanitized: LogFields = {};
  for (const key of ALLOWED_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" || typeof value === "number") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function createLogger(sink: LogSink = defaultSink) {
  const log = (level: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    sink({
      timestampUtc: new Date().toISOString(),
      level,
      message,
      fields: sanitizeFields(fields),
    });
  };
  return {
    info: (message: string, fields?: Record<string, unknown>) => log("info", message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => log("warn", message, fields),
    error: (message: string, fields?: Record<string, unknown>) => log("error", message, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;

function defaultSink(entry: LogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
