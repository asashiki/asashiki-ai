import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCoreApiApp } from "../../core-api/src/app.js";
import { createMcpGatewayApp } from "./app.js";
import { mcpToolCatalog } from "./mcp.js";

test("mcp gateway lists tools and calls core-api-backed actions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-mcp-gateway-"));
  const databasePath = join(directory, "core-api.sqlite");
  const archiveRoot = join(directory, "Asashiki_Archive");
  const diaryPath = join(archiveRoot, "Obsidian_Asashiki", "日记");
  const upstream = Fastify({ logger: false });

  mkdirSync(diaryPath, { recursive: true });
  writeFileSync(
    join(diaryPath, "2026-05-03.md"),
    "# 2026-05-03\n\nMCP 测试读取 Archive 中的日记。",
    "utf8"
  );

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
      ASASHIKI_ARCHIVE_ROOT: archiveRoot,
      ASASHIKI_DIARY_DIR: undefined,
      ADMIN_PANEL_TOKEN: undefined,
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
    assert.ok(listed.tools.length >= 9);
    // No registry in this harness → every catalog tool must be registered.
    // Guards refactors against accidentally dropping a tool.
    const listedNames = new Set(listed.tools.map((t) => t.name));
    for (const entry of mcpToolCatalog) {
      assert.ok(listedNames.has(entry.id), `tool missing from listTools: ${entry.id}`);
    }

    const connectors = await client.callTool({
      name: "connector_status",
      arguments: {}
    });
    assert.equal(connectors.isError, undefined);

    // archive_*, profile_read_summary, context_recent, journal_create_draft,
    // diary_list/read were removed (archive → OpenViking; profile/journal stay
    // as core-api routes for admin-web, not as MCP tools).

    const timeLogLookup = await client.callTool({
      name: "time_log_lookup",
      arguments: {
        at: "2025-04-16T17:25:00.000Z"
      }
    });
    assert.equal(timeLogLookup.isError, undefined);
  } finally {
    await client.close();
    await mcpGateway.close();
    await coreApi.close();
    await upstream.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
