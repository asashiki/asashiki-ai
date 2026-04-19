import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCoreApiApp } from "../../core-api/src/app.js";
import { createMcpGatewayApp } from "./app.js";

test("mcp gateway lists tools and calls core-api-backed actions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-mcp-gateway-"));
  const databasePath = join(directory, "core-api.sqlite");
  const upstream = Fastify({ logger: false });

  upstream.get("/time_events", async () => [
    {
      id: "evt-1",
      title: "整理时间日志接入",
      started_at: "2025-04-16T17:00:00.000Z",
      ended_at: "2025-04-16T18:00:00.000Z",
      note: "Supabase connector pilot"
    }
  ]);

  const upstreamAddress = await upstream.listen({
    host: "127.0.0.1",
    port: 0
  });

  const { server: coreApi } = await createCoreApiApp({
    env: {
      HOST: "127.0.0.1",
      PORT: 4101,
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
      PORT: 4201,
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
    name: "asashiki-mcp-test-client",
    version: "0.1.0"
  });

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${mcpAddress}/mcp`))
    );

    const listed = await client.listTools();
    assert.equal(listed.tools.length, 6);

    const profile = await client.callTool({
      name: "read_profile_summary",
      arguments: {}
    });
    assert.equal(profile.isError, undefined);

    const recentContext = await client.callTool({
      name: "get_recent_context",
      arguments: {}
    });
    assert.equal(recentContext.isError, undefined);

    const connectors = await client.callTool({
      name: "get_connector_status",
      arguments: {}
    });
    assert.equal(connectors.isError, undefined);

    const timeLogLookup = await client.callTool({
      name: "lookup_time_log_at",
      arguments: {
        at: "2025-04-16T17:25:00.000Z"
      }
    });
    assert.equal(timeLogLookup.isError, undefined);

    const created = await client.callTool({
      name: "create_journal_draft",
      arguments: {
        content: "Created from test suite.",
        source: "mcp-test"
      }
    });
    assert.equal(created.isError, undefined);
  } finally {
    await client.close();
    await mcpGateway.close();
    await coreApi.close();
    await upstream.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
