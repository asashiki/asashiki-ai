import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  auditEventSchema,
  connectorSchema,
  connectorSummarySchema,
  deviceActivitySchema,
  deviceActivitySummarySchema,
  deviceCurrentSchema,
  deviceReportInputSchema,
  deviceStateSchema,
  deviceTimelineSchema,
  healthRecordSchema,
  healthRecordsBatchInputSchema,
  healthRecordsQueryInputSchema,
  healthRecordsQuerySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  journalDraftSchema,
  journalEntrySchema,
  locationBatchInputSchema,
  locationCurrentSchema,
  locationHistoryQueryInputSchema,
  locationHistorySchema,
  locationPointSchema,
  profileSummarySchema,
  profileSummaryInputSchema,
  profileSummarySavedSchema,
  recentContextSchema,
  publicStatusCardSchema,
  publicStatusSchema,
  publicStatusWidgetConfigSchema
} from "@asashiki/schemas";
import type {
  DeviceReportInput,
  HealthRecordsBatchInput,
  HealthRecordsQueryInput
} from "@asashiki/schemas";

export type DeviceIdentity = {
  deviceId: string;
  deviceName: string;
  platform: string;
};

const deviceOnlineWindowMs = 5 * 60 * 1000;

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

    updateProfileSummary(input: unknown) {
      const payload = profileSummaryInputSchema.parse(input);
      const updatedAt = new Date().toISOString();
      const existing = database.prepare(`
        SELECT id
        FROM profile_summary
        ORDER BY datetime(updated_at) DESC
        LIMIT 1
      `).get() as JsonRow | undefined;

      const profileId =
        typeof existing?.id === "string" ? existing.id : "profile-main";

      if (existing) {
        database.prepare(`
          UPDATE profile_summary
          SET display_name = ?, summary = ?, preferences_json = ?, updated_at = ?
          WHERE id = ?
        `).run(
          payload.displayName,
          payload.summary,
          JSON.stringify(payload.topPreferences),
          updatedAt,
          profileId
        );
      } else {
        database.prepare(`
          INSERT INTO profile_summary (
            id,
            display_name,
            summary,
            preferences_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          profileId,
          payload.displayName,
          payload.summary,
          JSON.stringify(payload.topPreferences),
          updatedAt
        );
      }

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
        "admin-dashboard",
        "update_profile_summary",
        "profile_summary",
        profileId,
        JSON.stringify({
          displayName: payload.displayName,
          topPreferencesCount: payload.topPreferences.length
        }),
        updatedAt
      );

      return profileSummarySavedSchema.parse({
        displayName: payload.displayName,
        summary: payload.summary,
        topPreferences: payload.topPreferences,
        updatedAt
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
        "journal_create_draft",
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
      const snapshot = database.prepare(`
        SELECT captured_at, resting_heart_rate, sleep_hours, step_count
        FROM health_snapshots
        ORDER BY datetime(captured_at) DESC
        LIMIT 1
      `).get() as JsonRow | undefined;

      // Pull latest values from health_records (HealthConnect uploads)
      const hrRow = database.prepare(`
        SELECT value, recorded_at FROM health_records
        WHERE type IN ('resting_heart_rate', 'heart_rate') AND value IS NOT NULL
        ORDER BY datetime(recorded_at) DESC LIMIT 1
      `).get() as JsonRow | undefined;

      const sleepRow = database.prepare(`
        SELECT SUM(value) as total, MAX(recorded_at) as recorded_at FROM health_records
        WHERE type = 'sleep' AND value IS NOT NULL
          AND date(recorded_at) = date('now', 'localtime')
      `).get() as JsonRow | undefined;

      const stepsRow = database.prepare(`
        SELECT SUM(value) as total, MAX(recorded_at) as recorded_at FROM health_records
        WHERE type = 'steps' AND value IS NOT NULL
          AND date(recorded_at) = date('now', 'localtime')
      `).get() as JsonRow | undefined;

      // Prefer live records over manual snapshots when available
      const restingHeartRate = hrRow?.value ?? snapshot?.resting_heart_rate ?? null;
      const sleepHours = sleepRow?.total ? Number((Number(sleepRow.total) / 60).toFixed(1)) : (snapshot?.sleep_hours ?? null);
      const stepCount = stepsRow?.total ? Number(stepsRow.total) : (snapshot?.step_count ?? null);
      const capturedAt = hrRow?.recorded_at ?? stepsRow?.recorded_at ?? snapshot?.captured_at ?? new Date(0).toISOString();

      return healthSummarySchema.parse({
        restingHeartRate,
        sleepHours,
        stepCount,
        capturedAt
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
    },

    recordDeviceReport(identity: DeviceIdentity, input: unknown) {
      const payload = deviceReportInputSchema.parse(input);
      const receivedAt = new Date().toISOString();
      const occurredAt = payload.occurredAt ?? receivedAt;
      const extraJson = payload.extra ? JSON.stringify(payload.extra) : null;

      const previousState = database
        .prepare(
          `SELECT app_id, window_title, last_seen_at FROM device_states WHERE device_id = ?`
        )
        .get(identity.deviceId) as JsonRow | undefined;

      const stateChanged =
        !previousState ||
        previousState.app_id !== payload.appId ||
        previousState.window_title !== (payload.windowTitle ?? null);

      if (stateChanged) {
        if (
          previousState &&
          typeof previousState.last_seen_at === "string" &&
          typeof previousState.app_id === "string"
        ) {
          // Close the previous activity at min(occurredAt, last_seen_at + grace).
          // If the agent went offline (sleep/lock/network drop) between reports,
          // crediting the whole gap to the last-known app is wrong — e.g. an
          // overnight sleep would charge 8h to "startmenuexperiencehost". Grace
          // covers the normal heartbeat interval; anything beyond is a tracking
          // gap and should not count as continued use.
          const GRACE_MS = 120 * 1000;
          const lastSeenMs = new Date(previousState.last_seen_at).getTime();
          const occurredMs = new Date(occurredAt).getTime();
          const cappedEnd =
            Number.isFinite(lastSeenMs) && occurredMs > lastSeenMs + GRACE_MS
              ? new Date(lastSeenMs + GRACE_MS).toISOString()
              : occurredAt;
          database
            .prepare(
              `UPDATE device_activities
                 SET ended_at = ?
               WHERE device_id = ?
                 AND ended_at IS NULL
                 AND app_id = ?`
            )
            .run(
              cappedEnd,
              identity.deviceId,
              previousState.app_id
            );
        }

        database
          .prepare(
            `INSERT INTO device_activities (
              device_id, app_id, window_title, started_at, ended_at, extra_json, created_at
            ) VALUES (?, ?, ?, ?, NULL, ?, ?)`
          )
          .run(
            identity.deviceId,
            payload.appId,
            payload.windowTitle ?? null,
            occurredAt,
            extraJson,
            receivedAt
          );
      }

      database
        .prepare(
          `INSERT INTO device_states (
            device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(device_id) DO UPDATE SET
            device_name = excluded.device_name,
            platform = excluded.platform,
            app_id = excluded.app_id,
            window_title = excluded.window_title,
            last_seen_at = excluded.last_seen_at,
            extra_json = excluded.extra_json,
            updated_at = excluded.updated_at`
        )
        .run(
          identity.deviceId,
          identity.deviceName,
          identity.platform,
          payload.appId,
          payload.windowTitle ?? null,
          receivedAt,
          extraJson,
          receivedAt
        );

      return {
        ok: true,
        deviceId: identity.deviceId,
        stateChanged,
        recordedAt: occurredAt,
        receivedAt
      };
    },

    getDeviceCurrent() {
      const now = Date.now();
      const rows = database
        .prepare(
          `SELECT device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json
           FROM device_states
           ORDER BY last_seen_at DESC`
        )
        .all() as JsonRow[];

      const devices = rows.map((row) =>
        deviceStateSchema.parse({
          deviceId: row.device_id,
          deviceName: row.device_name,
          platform: row.platform,
          appId: row.app_id ?? null,
          windowTitle: row.window_title ?? null,
          lastSeenAt: row.last_seen_at,
          isOnline:
            typeof row.last_seen_at === "string" &&
            now - new Date(row.last_seen_at).getTime() < deviceOnlineWindowMs,
          extra:
            typeof row.extra_json === "string" && row.extra_json.length > 0
              ? (parseJsonObject(row.extra_json) as Record<string, unknown>)
              : null
        })
      );

      return deviceCurrentSchema.parse({
        fetchedAt: new Date().toISOString(),
        devices
      });
    },

    getDeviceTimeline(date: string, deviceId?: string | null) {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      const sql = deviceId
        ? `SELECT id, device_id, app_id, window_title, started_at, ended_at, extra_json
           FROM device_activities
           WHERE started_at BETWEEN ? AND ? AND device_id = ?
           ORDER BY started_at ASC`
        : `SELECT id, device_id, app_id, window_title, started_at, ended_at, extra_json
           FROM device_activities
           WHERE started_at BETWEEN ? AND ?
           ORDER BY started_at ASC`;
      const rows = (deviceId
        ? database.prepare(sql).all(dayStart, dayEnd, deviceId)
        : database.prepare(sql).all(dayStart, dayEnd)) as JsonRow[];

      const activities = rows.map((row) => {
        const startedAt =
          typeof row.started_at === "string" ? row.started_at : "";
        const endedAt =
          typeof row.ended_at === "string" ? row.ended_at : null;
        // Cap a single activity's duration at 4 hours.
        // Why: when the agent goes offline mid-activity and reconnects much later,
        // the previous activity's ended_at gets set to the new report time, which can
        // span hours/days of phone-off time. Anything over 4h is almost certainly
        // a tracking gap, not real continuous use.
        const MAX_ACTIVITY_SECONDS = 4 * 60 * 60;
        const durationSeconds =
          endedAt && startedAt
            ? Math.min(
                MAX_ACTIVITY_SECONDS,
                Math.max(
                  0,
                  Math.round(
                    (new Date(endedAt).getTime() -
                      new Date(startedAt).getTime()) /
                      1000
                  )
                )
              )
            : null;

        return deviceActivitySchema.parse({
          id: typeof row.id === "number" ? row.id : 0,
          deviceId: row.device_id,
          appId: row.app_id,
          windowTitle: row.window_title ?? null,
          startedAt,
          endedAt,
          durationSeconds,
          extra:
            typeof row.extra_json === "string" && row.extra_json.length > 0
              ? (parseJsonObject(row.extra_json) as Record<string, unknown>)
              : null
        });
      });

      return deviceTimelineSchema.parse({
        date,
        fetchedAt: new Date().toISOString(),
        activities
      });
    },

    getDeviceActivitySummary(date: string) {
      const timeline = this.getDeviceTimeline(date);
      const buckets = new Map<
        string,
        { appId: string; windowTitle: string | null; total: number; count: number }
      >();
      let totalSeconds = 0;

      for (const activity of timeline.activities) {
        if (activity.durationSeconds === null) {
          continue;
        }

        const key = activity.appId;
        const existing = buckets.get(key);

        if (existing) {
          existing.total += activity.durationSeconds;
          existing.count += 1;
        } else {
          buckets.set(key, {
            appId: activity.appId,
            windowTitle: activity.windowTitle,
            total: activity.durationSeconds,
            count: 1
          });
        }

        totalSeconds += activity.durationSeconds;
      }

      const perApp = [...buckets.values()]
        .map((bucket) => ({
          appId: bucket.appId,
          windowTitle: bucket.windowTitle,
          totalSeconds: bucket.total,
          count: bucket.count
        }))
        .sort((left, right) => right.totalSeconds - left.totalSeconds)
        .slice(0, 50);

      return deviceActivitySummarySchema.parse({
        date,
        fetchedAt: new Date().toISOString(),
        perApp,
        totalSeconds
      });
    },

    recordHealthBatch(identity: DeviceIdentity, input: unknown) {
      const payload = healthRecordsBatchInputSchema.parse(input);
      const insert = database.prepare(
        `INSERT INTO health_records (
          device_id, type, value, value_json, unit, recorded_at, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id, type, recorded_at) DO UPDATE SET
          value = excluded.value,
          value_json = excluded.value_json,
          unit = excluded.unit,
          source = excluded.source`
      );
      const createdAt = new Date().toISOString();
      let inserted = 0;

      for (const record of payload.records) {
        insert.run(
          identity.deviceId,
          record.type,
          typeof record.value === "number" ? record.value : null,
          record.valueJson ? JSON.stringify(record.valueJson) : null,
          record.unit ?? null,
          record.recordedAt,
          record.source ?? null,
          createdAt
        );
        inserted += 1;
      }

      return {
        ok: true,
        deviceId: identity.deviceId,
        recordsReceived: payload.records.length,
        upserted: inserted,
        savedAt: createdAt
      };
    },

    getHealthRecords(input: unknown) {
      const query = healthRecordsQueryInputSchema.parse(input ?? {});
      const filters: string[] = [];
      const params: unknown[] = [];

      if (query.type) {
        filters.push("type = ?");
        params.push(query.type);
      }

      if (query.from) {
        filters.push("recorded_at >= ?");
        params.push(query.from);
      }

      if (query.to) {
        filters.push("recorded_at <= ?");
        params.push(query.to);
      }

      if (query.deviceId) {
        filters.push("device_id = ?");
        params.push(query.deviceId);
      }

      const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const sql = `SELECT id, device_id, type, value, value_json, unit, recorded_at, source, created_at
                   FROM health_records
                   ${where}
                   ORDER BY recorded_at DESC
                   LIMIT ${limit}`;

      const rows = database.prepare(sql).all(...params) as JsonRow[];

      const records = rows.map((row) =>
        healthRecordSchema.parse({
          id: typeof row.id === "number" ? row.id : 0,
          deviceId: row.device_id,
          type: row.type,
          value: typeof row.value === "number" ? row.value : null,
          valueJson:
            typeof row.value_json === "string" && row.value_json.length > 0
              ? (parseJsonObject(row.value_json) as Record<string, unknown>)
              : null,
          unit: row.unit ?? null,
          recordedAt: row.recorded_at,
          source: row.source ?? null,
          createdAt: row.created_at
        })
      );

      return healthRecordsQuerySchema.parse({
        fetchedAt: new Date().toISOString(),
        records
      });
    },

    insertLocationBatch(deviceId: string, input: unknown) {
      const { points } = locationBatchInputSchema.parse(input);
      const now = new Date().toISOString();
      const stmt = database.prepare(`
        INSERT OR IGNORE INTO device_location_points
          (device_id, lat, lon, accuracy_m, altitude_m, speed_mps, bearing_deg, activity, recorded_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let inserted = 0;
      for (const p of points) {
        const result = stmt.run(
          deviceId,
          p.lat,
          p.lon,
          p.accuracyM ?? null,
          p.altitudeM ?? null,
          p.speedMps ?? null,
          p.bearingDeg ?? null,
          p.activity ?? null,
          p.recordedAt,
          now
        ) as { changes: number };
        inserted += result.changes;
      }
      return { inserted, total: points.length };
    },

    getLocationCurrent() {
      const rows = database.prepare(`
        SELECT p.device_id, p.lat, p.lon, p.accuracy_m, p.speed_mps, p.activity, p.recorded_at
        FROM device_location_points p
        INNER JOIN (
          SELECT device_id, MAX(recorded_at) AS max_recorded
          FROM device_location_points
          GROUP BY device_id
        ) latest ON p.device_id = latest.device_id AND p.recorded_at = latest.max_recorded
        ORDER BY p.recorded_at DESC
      `).all() as JsonRow[];

      return locationCurrentSchema.parse({
        fetchedAt: new Date().toISOString(),
        devices: rows.map((r) => ({
          deviceId: r.device_id,
          lat: r.lat,
          lon: r.lon,
          accuracyM: r.accuracy_m ?? null,
          speedMps: r.speed_mps ?? null,
          activity: r.activity ?? null,
          recordedAt: r.recorded_at
        }))
      });
    },

    getLocationHistory(input: unknown) {
      const query = locationHistoryQueryInputSchema.parse(input ?? {});
      const filters: string[] = [];
      const params: unknown[] = [];

      if (query.deviceId) { filters.push("device_id = ?"); params.push(query.deviceId); }
      if (query.from) { filters.push("recorded_at >= ?"); params.push(query.from); }
      if (query.to) { filters.push("recorded_at <= ?"); params.push(query.to); }

      const limit = Math.min(query.limit ?? 200, 500);
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = database.prepare(`
        SELECT id, device_id, lat, lon, accuracy_m, altitude_m, speed_mps, bearing_deg, activity, recorded_at, created_at
        FROM device_location_points
        ${where}
        ORDER BY recorded_at DESC
        LIMIT ${limit}
      `).all(...params) as JsonRow[];

      const points = rows.map((r) =>
        locationPointSchema.parse({
          id: r.id,
          deviceId: r.device_id,
          lat: r.lat,
          lon: r.lon,
          accuracyM: r.accuracy_m ?? null,
          altitudeM: r.altitude_m ?? null,
          speedMps: r.speed_mps ?? null,
          bearingDeg: r.bearing_deg ?? null,
          activity: r.activity ?? null,
          recordedAt: r.recorded_at,
          createdAt: r.created_at
        })
      );

      return locationHistorySchema.parse({
        fetchedAt: new Date().toISOString(),
        total: points.length,
        points
      });
    },

    insertVoiceMessage(input: {
      deviceId: string;
      senderName: string;
      senderAvatarUrl?: string;
      text: string;
      audioFilename: string;
      durationMs?: number;
    }) {
      const now = new Date().toISOString();
      const result = database.prepare(`
        INSERT INTO voice_messages
          (device_id, sender_name, sender_avatar_url, text, audio_filename, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.deviceId,
        input.senderName,
        input.senderAvatarUrl ?? null,
        input.text,
        input.audioFilename,
        input.durationMs ?? null,
        now
      );
      return { id: Number(result.lastInsertRowid), createdAt: now };
    },

    getPendingVoiceMessages(deviceId: string, audioBaseUrl: string) {
      const rows = database.prepare(`
        SELECT id, device_id, sender_name, sender_avatar_url, text, audio_filename,
               duration_ms, created_at, delivered_at, played_at
        FROM voice_messages
        WHERE device_id = ? AND delivered_at IS NULL
        ORDER BY created_at ASC
        LIMIT 20
      `).all(deviceId) as JsonRow[];

      return rows.map(r => ({
        id: r.id as number,
        deviceId: r.device_id as string,
        senderName: r.sender_name as string,
        senderAvatarUrl: (r.sender_avatar_url as string | null) ?? null,
        text: r.text as string,
        audioUrl: `${audioBaseUrl}/${r.audio_filename}`,
        durationMs: (r.duration_ms as number | null) ?? null,
        createdAt: r.created_at as string,
        deliveredAt: (r.delivered_at as string | null) ?? null,
        playedAt: (r.played_at as string | null) ?? null,
      }));
    },

    markVoiceMessageDelivered(id: number) {
      database.prepare(`UPDATE voice_messages SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL`)
        .run(new Date().toISOString(), id);
    },

    markVoiceMessagePlayed(id: number) {
      database.prepare(`UPDATE voice_messages SET played_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), id);
    }
  };
}

export type CoreRepository = ReturnType<typeof createRepository>;
