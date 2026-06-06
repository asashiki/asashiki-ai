import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import type { CoreApiEnv } from "../app.js";

// iOS Shortcuts ingestion endpoints (app-event / snapshot / debug probe).
// Extracted from app.ts; data lands in the shared device tables (raw SQL).
export function registerIosRoutes(
  server: FastifyInstance,
  deps: { env: CoreApiEnv; database: DatabaseSync }
) {
  const { env, database } = deps;
  // ── iOS shortcut endpoints (app-event + snapshot + debug probe) ───────────
  //
  // All three share IOS_PROBE_TOKEN and the synthetic device identity
  //   { deviceId: "ios-phone", deviceName: "iPhone", platform: "ios" }
  //
  // Data lands in the SHARED device tables so existing MCP tools
  // (device_status / device_timeline / device_activity_summary) and the
  // existing REST endpoints (/api/devices/current, /api/devices/timeline-query,
  // /api/devices/activity-summary) cover iOS automatically. No iOS-specific
  // tables, schemas, or MCP tools.
  const iosDevice = {
    deviceId: "ios-phone",
    deviceName: "iPhone",
    platform: "ios"
  };
  const iosProbeDir = nodePath.join(
    env.ASASHIKI_ARCHIVE_ROOT ?? "/archive",
    "Obsidian_Asashiki",
    "归档",
    "iOS探针"
  );
  const iosProbeRetentionDays = 14;

  function checkIosAuth(request: FastifyRequest, reply: FastifyReply): boolean {
    if (!env.IOS_PROBE_TOKEN) {
      reply.code(503).send({ message: "IOS_PROBE_TOKEN not configured on the server." });
      return false;
    }
    if (request.headers.authorization !== `Bearer ${env.IOS_PROBE_TOKEN}`) {
      reply.code(401).send({ message: "Unauthorized." });
      return false;
    }
    return true;
  }

  function pruneOldProbes() {
    try {
      if (!nodeFs.existsSync(iosProbeDir)) return;
      const cutoffMs = Date.now() - iosProbeRetentionDays * 24 * 60 * 60 * 1000;
      for (const name of nodeFs.readdirSync(iosProbeDir)) {
        if (!name.endsWith(".json")) continue;
        const full = nodePath.join(iosProbeDir, name);
        try {
          if (nodeFs.statSync(full).mtimeMs < cutoffMs) nodeFs.rmSync(full);
        } catch {
          // best-effort cleanup, ignore single-file failures
        }
      }
    } catch {
      // never block ingestion on cleanup failure
    }
  }

  // ── iOS app open/close event from Shortcuts personal automations ──────────
  // Body shape (matches the Shortcut as-configured):
  //   { app?: string, action: "open" | "close" }
  // Maps to the standard device-event model:
  //   "open X" → close any open device_activities row, insert new (app_id=X);
  //              update device_states (app_id=X, last_seen_at=now)
  //   "close"  → close any open device_activities row;
  //              update device_states (app_id=null = idle, last_seen_at=now)
  // Safety: any activity older than 2h with no end is force-closed (covers
  // missed close events from missed automations).
  server.post("/api/devices/ios/app-event", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const body = (request.body ?? {}) as { app?: unknown; action?: unknown };
    const action = body.action;
    if (action !== "open" && action !== "close") {
      reply.code(400);
      return { message: "action must be 'open' or 'close'." };
    }
    const app = typeof body.app === "string" && body.app.trim().length > 0
      ? body.app.trim()
      : null;
    if (action === "open" && !app) {
      reply.code(400);
      return { message: "'open' events require an 'app' field." };
    }

    const now = new Date().toISOString();
    const maxActivityMs = 2 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxActivityMs).toISOString();

    // 1) Force-close any stale unfinished activities.
    database.prepare(
      `UPDATE device_activities
         SET ended_at = ?
       WHERE device_id = ? AND ended_at IS NULL AND started_at < ?`
    ).run(now, iosDevice.deviceId, cutoff);

    // 2) Close any currently-open activity for this device.
    database.prepare(
      `UPDATE device_activities
         SET ended_at = ?
       WHERE device_id = ? AND ended_at IS NULL`
    ).run(now, iosDevice.deviceId);

    // 3) On "open" insert a new activity.
    let activityId: number | null = null;
    if (action === "open" && app) {
      const result = database.prepare(
        `INSERT INTO device_activities
           (device_id, app_id, window_title, started_at, ended_at, extra_json, created_at)
         VALUES (?, ?, NULL, ?, NULL, NULL, ?)`
      ).run(iosDevice.deviceId, app, now, now);
      activityId = Number(result.lastInsertRowid);
    }

    // 4) Upsert device_states. On "close" app_id becomes null = idle/home screen.
    // We preserve any existing extra_json (battery/focus/location from the
    // hourly snapshot) by reading then re-writing it.
    const existing = database
      .prepare(`SELECT extra_json FROM device_states WHERE device_id = ?`)
      .get(iosDevice.deviceId) as { extra_json?: string } | undefined;
    const nextAppId = action === "open" ? app : null;
    database.prepare(
      `INSERT INTO device_states
         (device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         device_name  = excluded.device_name,
         platform     = excluded.platform,
         app_id       = excluded.app_id,
         window_title = excluded.window_title,
         last_seen_at = excluded.last_seen_at,
         extra_json   = excluded.extra_json,
         updated_at   = excluded.updated_at`
    ).run(
      iosDevice.deviceId,
      iosDevice.deviceName,
      iosDevice.platform,
      nextAppId,
      now,
      existing?.extra_json ?? null,
      now
    );

    request.log.info({ ...iosDevice, app, action, activityId }, "ios app-event");
    return { ok: true, ...iosDevice, app, action, activityId, receivedAt: now };
  });

  // ── iOS hourly snapshot from a Time-of-Day automation ─────────────────────
  // Body shape (matches the Shortcut as-configured):
  //   {
  //     batteryLevel?: number,         // 0-100
  //     isCharging?:  boolean,
  //     isUnlocked?:  boolean,
  //     focusMode?:   string,          // e.g. "勿扰模式"
  //     location?:    [lat, lon, altitudeM]
  //   }
  // Writes:
  //   - device_states.extra_json: battery / focus / charging / unlocked
  //     (preserves app_id maintained by /app-event)
  //   - device_location_points:   one row when location present
  server.post("/api/devices/ios/snapshot", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    const extra: Record<string, unknown> = {};
    if (typeof body.batteryLevel === "number") extra.battery_percent = body.batteryLevel;
    if (typeof body.isCharging === "boolean")  extra.battery_charging = body.isCharging;
    if (typeof body.isUnlocked === "boolean")  extra.is_unlocked = body.isUnlocked;
    if (typeof body.focusMode === "string" && body.focusMode.trim().length > 0) {
      extra.focus_mode = body.focusMode.trim();
    }

    // Merge into existing extra_json so /app-event's separate writes coexist.
    const existing = database
      .prepare(`SELECT app_id, window_title, extra_json FROM device_states WHERE device_id = ?`)
      .get(iosDevice.deviceId) as
      | { app_id?: string | null; window_title?: string | null; extra_json?: string | null }
      | undefined;
    const mergedExtra = {
      ...(existing?.extra_json ? (JSON.parse(existing.extra_json) as Record<string, unknown>) : {}),
      ...extra
    };

    database.prepare(
      `INSERT INTO device_states
         (device_id, device_name, platform, app_id, window_title, last_seen_at, extra_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         device_name  = excluded.device_name,
         platform     = excluded.platform,
         last_seen_at = excluded.last_seen_at,
         extra_json   = excluded.extra_json,
         updated_at   = excluded.updated_at`
    ).run(
      iosDevice.deviceId,
      iosDevice.deviceName,
      iosDevice.platform,
      existing?.app_id ?? null,
      existing?.window_title ?? null,
      now,
      JSON.stringify(mergedExtra),
      now
    );

    let locationInserted = false;
    const loc = body.location;
    if (Array.isArray(loc) && loc.length >= 2 && typeof loc[0] === "number" && typeof loc[1] === "number") {
      const [lat, lon, altitude] = loc;
      database.prepare(
        `INSERT INTO device_location_points
           (device_id, lat, lon, accuracy_m, altitude_m, speed_mps, bearing_deg, activity, recorded_at, created_at)
         VALUES (?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)`
      ).run(
        iosDevice.deviceId,
        lat,
        lon,
        typeof altitude === "number" ? altitude : null,
        now,
        now
      );
      locationInserted = true;
    }

    request.log.info({ ...iosDevice, extra, locationInserted }, "ios snapshot");
    return { ok: true, ...iosDevice, extra: mergedExtra, locationInserted, receivedAt: now };
  });

  // ── iOS Shortcuts probe (long-lived debug endpoint) ───────────────────────
  // Accepts ANY JSON, dumps to Obsidian_Asashiki/归档/iOS探针/<timestamp>.json.
  // Useful when adding new Shortcut actions and you want to inspect the raw
  // body before writing a real endpoint. Files older than 14 days are pruned.
  server.post("/api/devices/ios/probe", async (request, reply) => {
    if (!checkIosAuth(request, reply)) return;

    const receivedAt = new Date().toISOString();
    const fileSafeStamp = receivedAt.replace(/[:.]/g, "-");
    nodeFs.mkdirSync(iosProbeDir, { recursive: true });
    const filePath = nodePath.join(iosProbeDir, `${fileSafeStamp}.json`);

    const payload = {
      receivedAt,
      remoteAddr: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      contentType: request.headers["content-type"] ?? null,
      body: request.body ?? null
    };
    const serialized = JSON.stringify(payload, null, 2);
    nodeFs.writeFileSync(filePath, serialized, "utf8");

    pruneOldProbes();

    const byteSize = Buffer.byteLength(serialized, "utf8");
    request.log.info({ filePath, byteSize }, "ios probe captured");

    return { ok: true, receivedAt, byteSize, savedTo: filePath };
  });
}
