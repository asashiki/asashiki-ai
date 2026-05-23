import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type CountRow = {
  count: number;
};

function ensureDirectory(path: string) {
  const directory = dirname(path);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function resolveDatabasePath(inputPath: string) {
  return resolve(process.cwd(), inputPath);
}

export function openDatabase(path: string) {
  ensureDirectory(path);
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

export function migrateDatabase(database: DatabaseSync) {
  // One-shot legacy cleanups (idempotent).
  database.exec(`DROP TABLE IF EXISTS ios_app_sessions;`);

  database.exec(`
    CREATE TABLE IF NOT EXISTS profile_summary (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      summary TEXT NOT NULL,
      preferences_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_drafts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      occurred_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_snapshots (
      id TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      resting_heart_rate INTEGER,
      sleep_hours REAL,
      step_count INTEGER,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS connectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_success_at TEXT,
      last_error TEXT,
      capabilities_json TEXT NOT NULL,
      exposure_level TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_states (
      device_id TEXT PRIMARY KEY,
      device_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      app_id TEXT,
      window_title TEXT,
      last_seen_at TEXT NOT NULL,
      extra_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      window_title TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      extra_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_device_activities_device_started
      ON device_activities(device_id, started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_device_activities_started
      ON device_activities(started_at DESC);

    CREATE TABLE IF NOT EXISTS health_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL,
      value_json TEXT,
      unit TEXT,
      recorded_at TEXT NOT NULL,
      source TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(device_id, type, recorded_at)
    );

    CREATE INDEX IF NOT EXISTS idx_health_records_recorded
      ON health_records(recorded_at DESC, type);

    CREATE TABLE IF NOT EXISTS device_location_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      accuracy_m REAL,
      altitude_m REAL,
      speed_mps REAL,
      bearing_deg REAL,
      activity TEXT,
      recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_location_points_device_recorded
      ON device_location_points(device_id, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_location_points_recorded
      ON device_location_points(recorded_at DESC);

    CREATE TABLE IF NOT EXISTS voice_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_avatar_url TEXT,
      text TEXT NOT NULL,
      audio_filename TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      played_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_voice_msgs_device_pending
      ON voice_messages(device_id, delivered_at);

    CREATE INDEX IF NOT EXISTS idx_voice_msgs_created
      ON voice_messages(created_at DESC);

  `);
}

function getCount(database: DatabaseSync, table: string) {
  const statement = database.prepare(
    `SELECT COUNT(*) AS count FROM ${table}`
  );
  const row = statement.get() as CountRow;
  return row.count;
}

export function seedDatabase(database: DatabaseSync) {
  const seededAt = "2026-04-18T10:00:00.000Z";

  if (getCount(database, "profile_summary") === 0) {
    database
      .prepare(`
        INSERT INTO profile_summary (
          id,
          display_name,
          summary,
          preferences_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        "profile-main",
        "Asashiki",
        "Building a personal AI control plane with clear boundaries between public, private operational, and private personal data.",
        JSON.stringify([
          "Cloudflare-first public delivery",
          "SQLite-first MVP",
          "Explicit journal write paths"
        ]),
        seededAt
      );
  }

  if (getCount(database, "journal_drafts") === 0) {
    database
      .prepare(`
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
      `)
      .run(
        "16d50359-72a8-4c11-9d08-6e5d9fd9e359",
        "Scaffold checkpoint",
        "Monorepo scaffold is in place and ready for the first real Core API data flow.",
        "system-seed",
        seededAt,
        "draft",
        seededAt,
        seededAt
      );
  }

  if (getCount(database, "journal_entries") === 0) {
    database
      .prepare(`
        INSERT INTO journal_entries (
          id,
          title,
          body,
          tags_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        "3fe0c5fc-3cd2-4fa6-ae7b-b9dd0653dd4a",
        "Planning freeze confirmed",
        "Milestone 0 finished with the MVP module list and non-goals locked.",
        JSON.stringify(["planning", "mvp"]),
        seededAt
      );
  }

  if (getCount(database, "health_snapshots") === 0) {
    database
      .prepare(`
        INSERT INTO health_snapshots (
          id,
          captured_at,
          resting_heart_rate,
          sleep_hours,
          step_count,
          note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        "0a43e650-07fb-4f7f-8c34-ea07b4a37801",
        seededAt,
        58,
        7.2,
        8430,
        "Stable baseline imported for MVP wiring."
      );
  }

  if (getCount(database, "connectors") === 0) {
    const statement = database.prepare(`
      INSERT INTO connectors (
        id,
        name,
        kind,
        status,
        last_seen_at,
        last_success_at,
        last_error,
        capabilities_json,
        exposure_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      "connector-codex",
      "Codex Desktop",
      "agent-client",
      "online",
      seededAt,
      seededAt,
      null,
      JSON.stringify(["journal-draft", "status-read"]),
      "mcp-exposed"
    );

    statement.run(
      "connector-cloudflare",
      "Cloudflare Public Web",
      "public-web",
      "degraded",
      seededAt,
      null,
      "Awaiting public API integration in Milestone 4.",
      JSON.stringify(["public-status"]),
      "public"
    );
  }

  if (getCount(database, "audit_events") === 0) {
    const statement = database.prepare(`
      INSERT INTO audit_events (
        id,
        actor,
        action,
        target_type,
        target_id,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      "c1f3a75e-0b52-46d5-b312-87566c6a4e97",
      "system",
      "seed_database",
      "database",
      "core-api",
      JSON.stringify({ milestone: "Milestone 2" }),
      seededAt
    );

    statement.run(
      "47cbf197-60ab-4fea-8774-a2782d6ca493",
      "codex",
      "bootstrap_repo",
      "milestone",
      "milestone-1",
      JSON.stringify({ packages: 2, apps: 4 }),
      seededAt
    );
  }
}

export function initializeDatabase(path: string, options?: { seed?: boolean }) {
  const database = openDatabase(path);
  migrateDatabase(database);

  if (options?.seed) {
    seedDatabase(database);
  }

  return database;
}
