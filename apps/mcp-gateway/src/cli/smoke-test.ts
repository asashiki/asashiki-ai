import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCoreApiApp } from "../../../core-api/src/app.js";
import { createMcpGatewayApp } from "../app.js";

const directory = mkdtempSync(join(tmpdir(), "asashiki-mcp-smoke-"));
const databasePath = join(directory, "core-api.sqlite");
const upstream = Fastify({ logger: false });

upstream.get("/time_events", async () => [
  {
    id: "evt-smoke-1",
    title: "MCP smoke 时间日志",
    started_at: "2025-04-16T17:00:00.000Z",
    ended_at: "2025-04-16T18:00:00.000Z",
    note: "Synthetic event for smoke validation."
  }
]);

const upstreamAddress = await upstream.listen({
  host: "127.0.0.1",
  port: 0
});

const { server: coreApi } = await createCoreApiApp({
  env: {
    HOST: "127.0.0.1",
    PORT: 4100,
    NODE_ENV: "test",
    CORE_API_DB_PATH: databasePath,
    SUPABASE_TIME_LOG_URL: `${upstreamAddress}/time_events`,
    SUPABASE_TIME_LOG_BEARER_TOKEN: undefined,
    SUPABASE_TIME_LOG_NAME: "Supabase 时间日志"
  },
  logger: false,
  seed: true
});

const coreApiAddress = await coreApi.listen({
  host: "127.0.0.1",
  port: 0
});

const { server: mcpGateway } = await createMcpGatewayApp({
  env: {
    HOST: "127.0.0.1",
    PORT: 4200,
    NODE_ENV: "test",
    MCP_CORE_API_BASE_URL: coreApiAddress
  },
  logger: false
});

const mcpAddress = await mcpGateway.listen({
  host: "127.0.0.1",
  port: 0
});

const client = new Client({
  name: "asashiki-mcp-smoke-client",
  version: "0.1.0"
});

try {
  const transport = new StreamableHTTPClientTransport(
    new URL(`${mcpAddress}/mcp`)
  );

  await client.connect(transport);

  const tools = await client.listTools();
  if (tools.tools.length < 6) {
    throw new Error("Expected at least 6 MCP tools.");
  }

  const profile = await client.callTool({
    name: "read_profile_summary",
    arguments: {}
  });

  const health = await client.callTool({
    name: "get_health_summary",
    arguments: {}
  });

  const timeLogLookup = await client.callTool({
    name: "lookup_time_log_at",
    arguments: {
      at: new Date().toISOString()
    }
  });

  const draft = await client.callTool({
    name: "create_journal_draft",
    arguments: {
      title: "MCP smoke draft",
      content: "Created through MCP smoke validation.",
      source: "mcp-smoke"
    }
  });

  if (profile.isError || health.isError || timeLogLookup.isError || draft.isError) {
    throw new Error("One or more MCP tool calls returned tool errors.");
  }

  console.log("MCP smoke test passed.");
} finally {
  await client.close();
  await mcpGateway.close();
  await coreApi.close();
  await upstream.close();
  rmSync(directory, { recursive: true, force: true });
}
