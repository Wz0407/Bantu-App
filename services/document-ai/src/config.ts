/** Typed service configuration. Loopback binding is mandatory for privacy (ARCHITECTURE.md §13). */
export interface ServiceConfig {
  host: string;
  port: number;
  serviceName: string;
  serviceVersion: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const rawPort = env["MYBANTU_DOCUMENT_AI_PORT"] ?? "5210";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MYBANTU_DOCUMENT_AI_PORT: "${rawPort}"`);
  }
  return {
    host: "127.0.0.1",
    port,
    serviceName: "mybantu-document-ai",
    serviceVersion: "0.1.0",
  };
}
