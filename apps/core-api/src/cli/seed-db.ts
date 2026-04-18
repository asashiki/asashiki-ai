import { loadCoreApiEnv } from "../app.js";
import { initializeDatabase, resolveDatabasePath, seedDatabase } from "../db.js";

const env = loadCoreApiEnv(process.env);
const databasePath = resolveDatabasePath(env.CORE_API_DB_PATH);
const database = initializeDatabase(databasePath);

seedDatabase(database);
database.close();

console.log(`Seeded Core API database at ${databasePath}`);
