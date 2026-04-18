import { strict as assert } from "node:assert";
import { createCoreApiApp, loadCoreApiEnv } from "../app.js";

const env = loadCoreApiEnv({
  ...process.env,
  NODE_ENV: "test",
  CORE_API_DB_PATH: "./data/core-api-smoke.sqlite"
});

const { server } = await createCoreApiApp({
  env,
  logger: false,
  seed: true
});

try {
  const profileResponse = await server.inject({
    method: "GET",
    url: "/api/profile/summary"
  });
  assert.equal(profileResponse.statusCode, 200);

  const draftResponse = await server.inject({
    method: "POST",
    url: "/api/journals/drafts",
    payload: {
      content: "Smoke test draft created through the Core API.",
      source: "smoke-test"
    }
  });
  assert.equal(draftResponse.statusCode, 201);

  const connectorsResponse = await server.inject({
    method: "GET",
    url: "/api/connectors/summary"
  });
  assert.equal(connectorsResponse.statusCode, 200);

  console.log("Core API smoke test passed.");
} finally {
  await server.close();
}
