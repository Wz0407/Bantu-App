import path from "node:path";

/** Typed service configuration. Loopback binding is mandatory for privacy (ARCHITECTURE.md §13). */
export interface ServiceConfig {
  host: string;
  port: number;
  serviceName: string;
  serviceVersion: string;
  /** Root for local data (documents, indexes). Never a cloud path. */
  dataDir: string;
  /** Root for locally installed models (OCR language data lives in <modelsDir>/ocr). */
  modelsDir: string;
  /** Max JSON request body accepted by the internal API (D1 hardening). */
  maxJsonBodyBytes: number;
  /** Max stored document file size the ingestion pipeline will read. */
  maxFileSizeBytes: number;
  /** Max PDF pages processed per document. */
  maxPdfPages: number;
  /** Per-request processing timeout for ingestion work (ms). */
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const rawPort = env["MYBANTU_DOCUMENT_AI_PORT"] ?? "5210";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MYBANTU_DOCUMENT_AI_PORT: "${rawPort}"`);
  }
  const positiveInt = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid ${name}: "${raw}"`);
    }
    return value;
  };
  return {
    host: "127.0.0.1",
    port,
    serviceName: "mybantu-document-ai",
    serviceVersion: "0.2.0",
    dataDir: path.resolve(env["MYBANTU_DATA_DIR"] ?? "./data"),
    modelsDir: path.resolve(env["MYBANTU_MODELS_DIR"] ?? "./models"),
    maxJsonBodyBytes: positiveInt("MYBANTU_DOCAI_MAX_JSON_BYTES", 1024 * 1024),
    maxFileSizeBytes: positiveInt("MYBANTU_DOCAI_MAX_FILE_BYTES", 20 * 1024 * 1024),
    maxPdfPages: positiveInt("MYBANTU_DOCAI_MAX_PDF_PAGES", 50),
    requestTimeoutMs: positiveInt("MYBANTU_DOCAI_REQUEST_TIMEOUT_MS", 120_000),
  };
}
