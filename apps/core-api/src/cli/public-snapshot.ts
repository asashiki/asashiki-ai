import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createCoreApiApp, loadCoreApiEnv } from "../app.js";

const env = loadCoreApiEnv({
  ...process.env,
  NODE_ENV: "test",
  CORE_API_DB_PATH: "./data/core-api-public-snapshot.sqlite"
});

const { server } = await createCoreApiApp({
  env,
  logger: false,
  seed: true
});

try {
  const status = await server.inject({
    method: "GET",
    url: "/public/status"
  });

  const widgetConfig = await server.inject({
    method: "GET",
    url: "/public/widget-config"
  });

  const output = {
    status: status.json(),
    widgetConfig: widgetConfig.json()
  };

  const snapshotPath = join(
    process.cwd(),
    "snapshots",
    "public-status.snapshot.json"
  );

  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Wrote public snapshot to ${snapshotPath}`);
} finally {
  await server.close();
}
