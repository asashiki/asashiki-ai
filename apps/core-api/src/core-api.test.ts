import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createCoreApiApp } from "./app.js";

test("seeded core api serves profile, journals, connectors and audit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-"));
  const databasePath = join(directory, "core-api.sqlite");
  const upstream = Fastify({ logger: false });

  upstream.get("/time_events", async () => [
    {
      id: "evt-1",
      title: "写项目计划",
      started_at: "2025-04-16T09:00:00.000Z",
      ended_at: "2025-04-16T10:00:00.000Z",
      note: "Milestone 8 connector planning",
      tags: ["planning", "project"]
    },
    {
      id: "evt-2",
      title: "整理控制台界面",
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

  const { server } = await createCoreApiApp({
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

    const profileAfterUpdate = await server.inject({
      method: "GET",
      url: "/api/profile/summary"
    });
    assert.equal(profileAfterUpdate.statusCode, 200);
    assert.equal(profileAfterUpdate.json().displayName, "Asashiki Console");

    const journals = await server.inject({
      method: "GET",
      url: "/api/journals"
    });
    assert.equal(journals.statusCode, 200);
    const journalPayload = journals.json();
    assert.equal(journalPayload.drafts.length >= 1, true);
    assert.equal(journalPayload.entries.length >= 1, true);

    const created = await server.inject({
      method: "POST",
      url: "/api/journals/drafts",
      payload: {
        content: "Milestone 2 test draft",
        source: "test-suite"
      }
    });
    assert.equal(created.statusCode, 201);
    const createdPayload = created.json();
    assert.equal(typeof createdPayload.id, "string");

    const draft = await server.inject({
      method: "GET",
      url: `/api/journals/drafts/${createdPayload.id}`
    });
    assert.equal(draft.statusCode, 200);

    const connectors = await server.inject({
      method: "GET",
      url: "/api/connectors/summary"
    });
    assert.equal(connectors.statusCode, 200);
    assert.equal(connectors.json().total >= 2, true);

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
    assert.equal(timeLogLookup.json().event.title, "整理控制台界面");

    const audit = await server.inject({
      method: "GET",
      url: "/api/audit/recent"
    });
    assert.equal(audit.statusCode, 200);
    assert.equal(audit.json().length >= 2, true);
  } finally {
    await server.close();
    await upstream.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
