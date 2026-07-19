import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createRegistry } from "./adapters/registry.js";
import { IndexStore } from "./ingestion/index-store.js";
import { createDocumentAiServer } from "./api/http-server.js";

const config = loadConfig();
const logger = createLogger();
const store = new IndexStore(config.dataDir);
const providers = createRegistry(config, store);

// Loopback only: this service must never be reachable from other machines or the browser.
createDocumentAiServer(config, logger, providers, store).listen(config.port, config.host, () => {
  logger.info("document-ai service started", {
    operation: "startup",
    status: `listening on ${config.host}:${config.port}`,
  });
});
