import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb, migrate } from "./db.js";
import { createMailer } from "./mailer.js";

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
await migrate(db);
const app = buildApp({ config, db, mailer: createMailer(config) });
await app.listen({ host: "0.0.0.0", port: config.PORT });
