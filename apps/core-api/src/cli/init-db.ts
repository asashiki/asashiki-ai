import { loadCoreApiEnv } from "../app.js";
import { initializeDatabase, resolveDatabasePath } from "../db.js";

const env = loadCoreApiEnv(process.env);
const databasePath = resolveDatabasePath(env.CORE_API_DB_PATH);
const database = initializeDatabase(databasePath);

database.close();

console.log(`Initialized Core API database at ${databasePath}`);
