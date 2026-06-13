import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCoreApiApp, loadCoreApiEnv } from "./app.js";

test("empty optional integrations do not block core-api startup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-empty-env-"));
  const databasePath = join(directory, "core-api.sqlite");
  const env = loadCoreApiEnv({
    NODE_ENV: "test",
    CORE_API_HOST: "127.0.0.1",
    CORE_API_PORT: "4100",
    CORE_API_DB_PATH: databasePath,
    REMOTE_MCP_SERVERS_JSON: "",
    SUPABASE_TIME_LOG_URL: "",
    SUPABASE_TIME_LOG_BEARER_TOKEN: "",
    SUPABASE_TIME_LOG_NAME: "",
    ADMIN_PANEL_TOKEN: "test-console-token"
  });
  const { server } = await createCoreApiApp({
    env,
    logger: false,
    seed: true
  });

  try {
    assert.equal(env.REMOTE_MCP_SERVERS_JSON, undefined);
    assert.equal(env.SUPABASE_TIME_LOG_URL, undefined);
    assert.equal(env.SUPABASE_TIME_LOG_BEARER_TOKEN, undefined);
    assert.equal(env.SUPABASE_TIME_LOG_NAME, "Supabase 时间日志");
    assert.equal(env.ADMIN_PANEL_TOKEN, "test-console-token");

    const health = await server.inject({
      method: "GET",
      url: "/health"
    });
    assert.equal(health.statusCode, 200);

    const timeLogRecent = await server.inject({
      method: "GET",
      url: "/api/time-log/recent?limit=1"
    });
    assert.equal(timeLogRecent.statusCode, 503);

    // Old core-api /console HTML removed (superseded by the mcp-gateway console).
  } finally {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("seeded core api serves profile, journals, remote mcp, connectors and audit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-"));
  const databasePath = join(directory, "core-api.sqlite");
  const archiveRoot = join(directory, "Asashiki_Archive");
  const diaryPath = join(archiveRoot, "Obsidian_Asashiki", "日记");
  const upstream = Fastify({ logger: false });
  const remoteMcpApp = Fastify({ logger: false });

  mkdirSync(diaryPath, { recursive: true });
  writeFileSync(
    join(diaryPath, "2026-05-03.md"),
    "# 2026-05-03\n\n今天整理个人 AI 中枢的 Archive 接入。",
    "utf8"
  );

  // Mock the real Supabase time_events table with the real column names.
  // Minimal PostgREST semantics: filter by start_time/end_time, order, limit.
  const timeEvents = [
    {
      id: "evt-1",
      category: "Write milestone plan",
      start_time: "2025-04-16T09:00:00.000Z",
      end_time: "2025-04-16T10:00:00.000Z",
      remark: "Milestone 8 connector planning",
      tags: ["planning", "project"]
    },
    {
      id: "evt-2",
      category: "Refine admin console",
      start_time: "2025-04-16T17:00:00.000Z",
      end_time: "2025-04-16T18:00:00.000Z",
      remark: "Admin-first pass",
      tags: ["ui", "console"]
    }
  ];

  upstream.get("/time_events", async (request) => {
    const q = request.query as Record<string, string | string[] | undefined>;
    const asList = (v: string | string[] | undefined) =>
      v == null ? [] : Array.isArray(v) ? v : [v];

    let rows = [...timeEvents];

    const parseOp = (expr: string): [string, string] => {
      const idx = expr.indexOf(".");
      return idx === -1 ? [expr, ""] : [expr.slice(0, idx), expr.slice(idx + 1)];
    };
    for (const expr of asList(q.start_time)) {
      const [op, val] = parseOp(expr);
      if (op === "lte") rows = rows.filter((r) => r.start_time <= val);
      else if (op === "gte") rows = rows.filter((r) => r.start_time >= val);
    }
    for (const expr of asList(q.end_time)) {
      const [op, val] = parseOp(expr);
      if (op === "lte") rows = rows.filter((r) => r.end_time != null && r.end_time <= val);
      else if (op === "gte") rows = rows.filter((r) => r.end_time != null && r.end_time >= val);
    }
    for (const expr of asList(q.or)) {
      // Supported shape: (end_time.gte.<X>,end_time.is.null)
      const m = /^\(end_time\.gte\.([^,]+),end_time\.is\.null\)$/.exec(expr);
      if (m && m[1]) {
        const v = m[1];
        rows = rows.filter((r) => (r.end_time != null && r.end_time >= v) || r.end_time == null);
      }
    }
    if (typeof q.order === "string") {
      const [col, dir] = q.order.split(".");
      if (col) {
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[col] ?? "";
          const bv = (b as Record<string, unknown>)[col] ?? "";
          return dir === "desc"
            ? String(bv).localeCompare(String(av))
            : String(av).localeCompare(String(bv));
        });
      }
    }
    if (typeof q.limit === "string") rows = rows.slice(0, parseInt(q.limit, 10));
    return rows;
  });

  const upstreamAddress = await upstream.listen({
    host: "127.0.0.1",
    port: 0
  });

  const remoteMcpServer = new McpServer({
    name: "remote-test-server",
    version: "0.1.0"
  });

  remoteMcpServer.registerTool(
    "list_time_events",
    {
      title: "List Time Events",
      description: "Return a synthetic time-event preview.",
      inputSchema: {
        limit: z.number().int().positive().max(5).optional()
      },
      annotations: {
        readOnlyHint: true
      }
    },
    async (input: { limit?: number }) => {
      const items = [
        {
          id: "evt-2",
          title: "Refine admin console"
        }
      ].slice(0, input.limit ?? 1);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ items }, null, 2)
          }
        ],
        structuredContent: {
          items
        }
      };
    }
  );

  remoteMcpApp.post("/mcp", async (request, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    reply.raw.on("close", () => {
      transport.close();
    });

    await remoteMcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    return reply;
  });

  const remoteMcpAddress = await remoteMcpApp.listen({
    host: "127.0.0.1",
    port: 0
  });

  const { server } = await createCoreApiApp({
    env: {
      HOST: "127.0.0.1",
      PORT: 4100,
      NODE_ENV: "test",
      CORE_API_DB_PATH: databasePath,
      ASASHIKI_ARCHIVE_ROOT: archiveRoot,
      ASASHIKI_DIARY_DIR: undefined,
      ADMIN_PANEL_TOKEN: undefined,
      REMOTE_MCP_SERVERS_JSON: JSON.stringify([
        {
          id: "supabase",
          name: "Supabase Remote MCP",
          url: `${remoteMcpAddress}/mcp`,
          description: "Synthetic remote MCP used by the test suite."
        }
      ]),
      SUPABASE_TIME_LOG_URL: `${upstreamAddress}/time_events`,
      SUPABASE_TIME_LOG_BEARER_TOKEN: undefined,
      SUPABASE_TIME_LOG_NAME: "Supabase 时间日志"
    },
    logger: false,
    seed: true
  });

  try {
    const profile = await server.inject({
      method: "GET",
      url: "/api/profile/summary"
    });
    assert.equal(profile.statusCode, 200);

    const updatedProfile = await server.inject({
      method: "PUT",
      url: "/api/profile/summary",
      payload: {
        displayName: "Asashiki Console",
        summary: "Profile data can now be edited through the admin control room.",
        topPreferences: ["quiet UI", "journal-first", "agent-safe tools"]
      }
    });
    assert.equal(updatedProfile.statusCode, 200);
    assert.equal(updatedProfile.json().displayName, "Asashiki Console");

    const journals = await server.inject({
      method: "GET",
      url: "/api/journals"
    });
    assert.equal(journals.statusCode, 200);
    assert.equal(journals.json().drafts.length >= 1, true);

    const created = await server.inject({
      method: "POST",
      url: "/api/journals/drafts",
      payload: {
        content: "Milestone 2 test draft",
        source: "test-suite"
      }
    });
    assert.equal(created.statusCode, 201);

    const connectors = await server.inject({
      method: "GET",
      url: "/api/connectors/summary"
    });
    assert.equal(connectors.statusCode, 200);
    assert.equal(connectors.json().total >= 4, true);

    const archiveStatus = await server.inject({
      method: "GET",
      url: "/api/archive/status"
    });
    assert.equal(archiveStatus.statusCode, 200);
    assert.equal(archiveStatus.json().status, "online");
    assert.equal(archiveStatus.json().fileCount, 1);

    // diary_read/list routes removed — agents use OpenViking directly now.
    // POST /api/diary writes to OpenViking; tested separately when VIKING env is set.

    const remoteServers = await server.inject({
      method: "GET",
      url: "/api/remote-mcp/servers"
    });
    assert.equal(remoteServers.statusCode, 200);
    assert.equal(remoteServers.json()[0].toolCount, 1);

    const remoteTools = await server.inject({
      method: "GET",
      url: "/api/remote-mcp/servers/supabase/tools"
    });
    assert.equal(remoteTools.statusCode, 200);
    assert.equal(remoteTools.json()[0].name, "list_time_events");

    const remoteInvoke = await server.inject({
      method: "POST",
      url: "/api/remote-mcp/servers/supabase/tools/list_time_events/invoke",
      payload: {
        arguments: {
          limit: 1
        }
      }
    });
    assert.equal(remoteInvoke.statusCode, 200);
    assert.equal(remoteInvoke.json().ok, true);

    const timeLogRecent = await server.inject({
      method: "GET",
      url: "/api/time-log/recent?limit=2"
    });
    assert.equal(timeLogRecent.statusCode, 200);
    assert.equal(timeLogRecent.json().events.length, 2);

    const timeLogLookup = await server.inject({
      method: "GET",
      url: "/api/time-log/lookup?at=2025-04-16T17:25:00.000Z"
    });
    assert.equal(timeLogLookup.statusCode, 200);
    assert.equal(timeLogLookup.json().matched, true);
    assert.equal(timeLogLookup.json().event.title, "Refine admin console");

    const audit = await server.inject({
      method: "GET",
      url: "/api/audit/recent"
    });
    assert.equal(audit.statusCode, 200);
    assert.equal(audit.json().length >= 2, true);
  } finally {
    await server.close();
    await upstream.close();
    await remoteMcpApp.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

// Route-coverage guard: asserts every expected route is registered. This is the
// safety net for splitting app.ts into route modules — if a split drops a route,
// this test fails. Keep this list in sync when intentionally adding/removing routes.
test("core-api registers all expected routes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-routes-"));
  const env = loadCoreApiEnv({
    NODE_ENV: "test",
    CORE_API_HOST: "127.0.0.1",
    CORE_API_PORT: "4100",
    CORE_API_DB_PATH: join(directory, "core-api.sqlite"),
    ADMIN_PANEL_TOKEN: "test-console-token"
  });
  const { server } = await createCoreApiApp({ env, logger: false, seed: true });

  const expected: Array<[string, string]> = [
    ["GET", "/health"],
    ["GET", "/api/runtime"],
    ["GET", "/api/profile/summary"],
    ["PUT", "/api/profile/summary"],
    ["GET", "/api/context/recent"],
    ["GET", "/api/connectors"],
    ["GET", "/api/connectors/summary"],
    ["GET", "/api/audit/recent"],
    ["GET", "/api/journals"],
    ["POST", "/api/journals/drafts"],
    ["GET", "/api/journals/drafts/:id"],
    ["GET", "/api/archive/status"],
    ["GET", "/api/archive/files"],
    ["GET", "/api/archive/search"],
    ["GET", "/api/archive/file"],
    ["POST", "/api/archive/file"],
    ["DELETE", "/api/archive/file"],
    ["GET", "/api/devices/current"],
    ["GET", "/api/devices/activity-summary"],
    ["GET", "/api/devices/timeline"],
    ["GET", "/api/devices/timeline-query"],
    ["GET", "/api/devices/health"],
    ["GET", "/api/devices/health-records"],
    ["GET", "/api/devices/location/current"],
    ["GET", "/api/devices/location/history"],
    ["POST", "/api/devices/health"],
    ["POST", "/api/devices/location"],
    ["POST", "/api/devices/report"],
    ["POST", "/api/devices/ios/app-event"],
    ["POST", "/api/devices/ios/probe"],
    ["POST", "/api/devices/ios/snapshot"],
    ["GET", "/api/devices/voice-messages/pending"],
    ["POST", "/api/devices/voice-messages/:id/delivered"],
    ["POST", "/api/devices/voice-messages/:id/played"],
    ["GET", "/api/health/latest"],
    ["GET", "/api/health/summary"],
    ["GET", "/api/time-log/recent"],
    ["GET", "/api/time-log/lookup"],
    ["GET", "/api/time-log/range"],
    ["GET", "/api/weather"],
    ["GET", "/api/steam/profile"],
    ["GET", "/api/steam/recent-games"],
    ["GET", "/api/remote-mcp/servers"],
    ["POST", "/api/remote-mcp/servers"],
    ["DELETE", "/api/remote-mcp/servers/:serverId"],
    ["GET", "/api/remote-mcp/servers/:serverId/tools"],
    ["POST", "/api/remote-mcp/servers/:serverId/tools/:toolName/invoke"],
    ["POST", "/api/remote-mcp/servers/:serverId/tools/:toolName/proxy"],
    ["POST", "/api/diary"],
    ["POST", "/api/voice-messages"],
    ["POST", "/api/x-search"],
    ["GET", "/voice/:filename"],
    ["GET", "/public/cards"],
    ["GET", "/public/status"],
    ["GET", "/public/widget-config"],
    ["POST", "/api/admin/run-migrations"]
  ];

  try {
    await server.ready();
    for (const [method, url] of expected) {
      assert.ok(
        server.hasRoute({ method: method as "GET", url }),
        `missing route: ${method} ${url}`
      );
    }
    // Smoke a few dependency-free read routes.
    for (const url of ["/health", "/api/runtime", "/api/connectors", "/api/devices/current"]) {
      const res = await server.inject({ method: "GET", url });
      assert.equal(res.statusCode, 200, `route ${url} should be 200`);
    }
  } finally {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
