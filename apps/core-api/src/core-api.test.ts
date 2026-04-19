import { mkdtempSync, rmSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCoreApiApp } from "./app.js";

test("seeded core api serves profile, journals, remote mcp, connectors and audit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-"));
  const databasePath = join(directory, "core-api.sqlite");
  const upstream = Fastify({ logger: false });
  const remoteMcpApp = Fastify({ logger: false });

  upstream.get("/time_events", async () => [
    {
      id: "evt-1",
      title: "Write milestone plan",
      started_at: "2025-04-16T09:00:00.000Z",
      ended_at: "2025-04-16T10:00:00.000Z",
      note: "Milestone 8 connector planning",
      tags: ["planning", "project"]
    },
    {
      id: "evt-2",
      title: "Refine admin console",
      started_at: "2025-04-16T17:00:00.000Z",
      ended_at: "2025-04-16T18:00:00.000Z",
      note: "Admin-first pass",
      tags: ["ui", "console"]
    }
  ]);

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
    assert.equal(connectors.json().total >= 3, true);

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
