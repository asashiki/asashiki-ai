import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { createCoreApiApp } from "./app.js";

test("seeded core api serves profile, journals, connectors and audit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asashiki-core-api-"));
  const databasePath = join(directory, "core-api.sqlite");

  const { server } = await createCoreApiApp({
    env: {
      HOST: "127.0.0.1",
      PORT: 4100,
      NODE_ENV: "test",
      CORE_API_DB_PATH: databasePath
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
    assert.equal(connectors.json().total >= 1, true);

    const audit = await server.inject({
      method: "GET",
      url: "/api/audit/recent"
    });
    assert.equal(audit.statusCode, 200);
    assert.equal(audit.json().length >= 2, true);
  } finally {
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
