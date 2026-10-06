import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createStorage } from "./storage.js";

const config = loadConfig();
const app = buildApp({ config, db: createDb(config.DATABASE_URL), storage: createStorage(config) });
await app.listen({ host: "0.0.0.0", port: config.PORT });
