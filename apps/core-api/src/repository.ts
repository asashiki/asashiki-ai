import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  auditEventSchema,
  connectorSchema,
  connectorSummarySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  journalDraftSchema,
  journalEntrySchema,
  profileSummarySchema,
  recentContextSchema,
  publicStatusCardSchema,
  publicStatusSchema,
  publicStatusWidgetConfigSchema
} from "@asashiki/schemas";

type JsonRow = {
  [key: string]: unknown;
};

function parseJsonArray(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return typeof parsed === "object" && parsed !== null ? parsed : {};
}

export function createRepository(database: DatabaseSync) {
  return {
    getProfileSummary() {
      const row = database.prepare(`
        SELECT display_name, summary, preferences_json
        FROM profile_summary
        ORDER BY updated_at DESC
        LIMIT 1
      `).get() as JsonRow | undefined;

      return profileSummarySchema.parse({
        displayName: row?.display_name ?? "Asashiki",
        summary: row?.summary ?? "Profile summary not initialized.",
        topPreferences: parseJsonArray(row?.preferences_json)
      });
    },

    listJournals() {
      const drafts = database.prepare(`
        SELECT id, title, body, source, occurred_at, status, created_at, updated_at
        FROM journal_drafts
        ORDER BY datetime(updated_at) DESC
      `).all() as JsonRow[];

      const entries = database.prepare(`
        SELECT id, title, body, tags_json, created_at
        FROM journal_entries
        ORDER BY datetime(created_at) DESC
      `).all() as JsonRow[];

      return journalCollectionSchema.parse({
        drafts: drafts.map((row) =>
          journalDraftSchema.parse({
            id: row.id,
            title: row.title,
            body: row.body,
            source: row.source,
            occurredAt: row.occurred_at ?? null,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          })
        ),
        entries: entries.map((row) =>
          journalEntrySchema.parse({
            id: row.id,
            title: row.title,
            body: row.body,
            tags: parseJsonArray(row.tags_json),
            createdAt: row.created_at
          })
        )
      });
    },

    createJournalDraft(input: unknown) {
      const payload = journalDraftInputSchema.parse(input);
      const createdAt = new Date().toISOString();
      const title =
        payload.title?.trim() && payload.title.trim().length > 0
          ? payload.title.trim()
          : payload.content.slice(0, 48);
      const draftId = randomUUID();

      database.prepare(`
        INSERT INTO journal_drafts (
          id,
          title,
          body,
          source,
          occurred_at,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        draftId,
        title,
        payload.content,
        payload.source,
        payload.occurredAt ?? null,
        "draft",
        createdAt,
        createdAt
      );

      database.prepare(`
        INSERT INTO audit_events (
          id,
          actor,
          action,
          target_type,
          target_id,
          metadata_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        payload.source,
        "create_journal_draft",
        "journal_draft",
        draftId,
        JSON.stringify({
          title,
          contentLength: payload.content.length
        }),
        createdAt
      );

      return journalDraftSavedSchema.parse({
        id: draftId,
        title,
        source: payload.source,
        createdAt
      });
    },

    getJournalDraft(draftId: string) {
      const row = database.prepare(`
        SELECT id, title, body, source, occurred_at, status, created_at, updated_at
        FROM journal_drafts
        WHERE id = ?
      `).get(draftId) as JsonRow | undefined;

      if (!row) {
        return null;
      }

      return journalDraftSchema.parse({
        id: row.id,
        title: row.title,
        body: row.body,
        source: row.source,
        occurredAt: row.occurred_at ?? null,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    },

    getHealthSummary() {
      const row = database.prepare(`
        SELECT captured_at, resting_heart_rate, sleep_hours, step_count
        FROM health_snapshots
        ORDER BY datetime(captured_at) DESC
        LIMIT 1
      `).get() as JsonRow | undefined;

      return healthSummarySchema.parse({
        restingHeartRate: row?.resting_heart_rate ?? null,
        sleepHours: row?.sleep_hours ?? null,
        stepCount: row?.step_count ?? null,
        capturedAt: row?.captured_at ?? new Date(0).toISOString()
      });
    },

    getLatestHealthSnapshot() {
      const row = database.prepare(`
        SELECT id, captured_at, resting_heart_rate, sleep_hours, step_count, note
        FROM health_snapshots
        ORDER BY datetime(captured_at) DESC
        LIMIT 1
      `).get() as JsonRow | undefined;

      return healthSnapshotSchema.parse({
        id: row?.id ?? "health-missing",
        capturedAt: row?.captured_at ?? new Date(0).toISOString(),
        restingHeartRate: row?.resting_heart_rate ?? null,
        sleepHours: row?.sleep_hours ?? null,
        stepCount: row?.step_count ?? null,
        note: row?.note ?? null
      });
    },

    listConnectors() {
      const rows = database.prepare(`
        SELECT
          id,
          name,
          kind,
          status,
          last_seen_at,
          last_success_at,
          last_error,
          capabilities_json,
          exposure_level
        FROM connectors
        ORDER BY name ASC
      `).all() as JsonRow[];

      return rows.map((row) =>
        connectorSchema.parse({
          id: row.id,
          name: row.name,
          kind: row.kind,
          status: row.status,
          lastSeenAt: row.last_seen_at,
          lastSuccessAt: row.last_success_at ?? null,
          lastError: row.last_error ?? null,
          capabilities: parseJsonArray(row.capabilities_json),
          exposureLevel: row.exposure_level
        })
      );
    },

    getConnectorSummary() {
      const rows = this.listConnectors();
      return connectorSummarySchema.parse({
        total: rows.length,
        online: rows.filter((row) => row.status === "online").length,
        degraded: rows.filter((row) => row.status === "degraded").length,
        offline: rows.filter((row) => row.status === "offline").length
      });
    },

    listRecentAudit(limit = 10) {
      const rows = database.prepare(`
        SELECT id, actor, action, target_type, target_id, metadata_json, created_at
        FROM audit_events
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      `).all(limit) as JsonRow[];

      return rows.map((row) =>
        auditEventSchema.parse({
          id: row.id,
          actor: row.actor,
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          metadata: parseJsonObject(row.metadata_json),
          createdAt: row.created_at
        })
      );
    },

    getRecentContext() {
      const journals = this.listJournals();
      const connectorSummary = this.getConnectorSummary();
      const healthSummary = this.getHealthSummary();

      const statusHints = [
        `connectors: ${connectorSummary.online}/${connectorSummary.total} online`,
        `sleep-hours: ${healthSummary.sleepHours ?? "n/a"}`,
        `step-count: ${healthSummary.stepCount ?? "n/a"}`
      ];

      return recentContextSchema.parse({
        summary:
          "Recent context blends journal activity with high-level operational and health hints for agent-safe recall.",
        recentDraftTitles: journals.drafts.slice(0, 3).map((draft) => draft.title),
        recentEntryTitles: journals.entries.slice(0, 3).map((entry) => entry.title),
        statusHints,
        generatedAt: new Date().toISOString()
      });
    },

    getPublicCards() {
      const connectorSummary = this.getConnectorSummary();

      return publicStatusCardSchema.array().parse([
        {
          id: "public-surface",
          title: "Public Surface",
          value: "Read-only API",
          visibility: "public"
        },
        {
          id: "connector-availability",
          title: "Connector Availability",
          value: `${connectorSummary.online}/${connectorSummary.total}`,
          visibility: "public"
        },
        {
          id: "privacy-boundary",
          title: "Private Boundary",
          value: "Personal data protected",
          visibility: "public"
        },
        {
          id: "update-path",
          title: "Update Path",
          value: "Core API governed",
          visibility: "public"
        }
      ]);
    },

    getPublicStatus() {
      const connectorSummary = this.getConnectorSummary();

      const status =
        connectorSummary.offline > 0
          ? "degraded"
          : connectorSummary.degraded > 0
            ? "degraded"
            : "online";

      return publicStatusSchema.parse({
        status,
        message:
          status === "online"
            ? "Core services seeded and reachable."
            : "Core services are reachable with partial integration pending.",
        updatedAt: new Date().toISOString(),
        cards: this.getPublicCards()
      });
    },

    getPublicWidgetConfig() {
      return publicStatusWidgetConfigSchema.parse({
        component: "public-status-widget",
        title: "Asashiki Public Status",
        subtitle:
          "This widget is intentionally driven by a narrow public API so it can move between static frontends without exposing private data.",
        statusEndpoint: "/public/status",
        cardsEndpoint: "/public/cards",
        pollingIntervalMs: 30000,
        maxCards: 3,
        theme: "linen-signal",
        emptyMessage: "Public status is temporarily unavailable.",
        docsLabel: "Static Frontend Config"
      });
    }
  };
}

export type CoreRepository = ReturnType<typeof createRepository>;
