import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createNotConfiguredRegistry } from "./adapters/not-configured.js";
import { handleRequest } from "./api/router.js";

const config = loadConfig();
const logger = createLogger();
const providers = createNotConfiguredRegistry();

const server = createServer((req, res) => {
  const started = Date.now();
  const { statusCode, body } = handleRequest(
    req.method ?? "GET",
    req.url ?? "/",
    config,
    providers,
  );
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
  logger.info("request", {
    operation: `${req.method} ${req.url?.split("?")[0] ?? "/"}`,
    status: statusCode,
    durationMs: Date.now() - started,
  });
});

// Loopback only: this service must never be reachable from other machines or the browser.
server.listen(config.port, config.host, () => {
  logger.info("document-ai service started", {
    operation: "startup",
    status: `listening on ${config.host}:${config.port}`,
  });
});
