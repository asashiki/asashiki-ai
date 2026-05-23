import {
  connectorSchema,
  timeLogEventSchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRangeInputSchema,
  timeLogRangeSchema,
  timeLogRecentSchema
} from "@asashiki/schemas";

type RawRecord = Record<string, unknown>;

export type SupabaseTimeLogClientOptions = {
  url?: string;
  bearerToken?: string;
  connectorId?: string;
  connectorName?: string;
};

// Lookup defaults
const nearestPreviousWindowDays = 14;
const defaultRecentLimit = 5;
const defaultRangeLimit = 50;
const maxRangeLimit = 500;

function asRecord(value: unknown): RawRecord | null {
  return typeof value === "object" && value !== null
    ? (value as RawRecord)
    : null;
}

function pickString(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickStringArray(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 12);
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 12);
    }
  }

  return [];
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    const normalized = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    const numeric = Number(trimmed);

    if (!Number.isNaN(numeric) && /^\d+$/.test(trimmed)) {
      return toIsoDate(numeric);
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function extractRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((row): row is RawRecord => row !== null);
  }

  const record = asRecord(payload);
  if (!record) return [];

  for (const key of ["data", "rows", "result", "items", "records"] as const) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord).filter((row): row is RawRecord => row !== null);
    }
  }
  return [];
}

function normalizeRow(row: RawRecord, fallbackIndex: number) {
  // Real time_events columns: start_time, end_time, category, remark, source.
  // Keep legacy fallbacks so older table schemas keep working.
  const startedAt = toIsoDate(
    row.start_time ??
      row.started_at ??
      row.start_at ??
      row.occurred_at ??
      row.timestamp ??
      row.created_at
  );

  if (!startedAt) return null;

  const endedAt = toIsoDate(
    row.end_time ?? row.ended_at ?? row.end_at ?? row.finished_at ?? null
  );
  const title =
    pickString(row, ["category", "title", "activity", "activity_name", "label", "name", "event", "type"]) ??
    `time-event-${fallbackIndex + 1}`;
  const note = pickString(row, ["remark", "note", "notes", "description", "details", "content", "summary", "comment"]);
  const rawPreview = note ?? pickString(row, ["context", "status", "location", "project"]);

  return timeLogEventSchema.parse({
    id: pickString(row, ["id", "uuid", "event_id", "event_key"]) ?? `${startedAt}-${fallbackIndex + 1}`,
    title,
    startedAt,
    endedAt,
    note,
    source: pickString(row, ["source", "origin"]) ?? "supabase-time-log",
    tags: pickStringArray(row, ["tags", "tag_list", "categories"]),
    rawPreview
  });
}

function stripQuery(url: string) {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

export function createSupabaseTimeLogClient(options: SupabaseTimeLogClientOptions) {
  const connectorId = options.connectorId ?? "connector-supabase-time-log";
  const connectorName = options.connectorName ?? "Supabase 时间日志";
  const integrationEnabled =
    typeof options.url === "string" && options.url.trim().length > 0;
  const baseUrl = integrationEnabled && options.url ? stripQuery(options.url) : "";
  let lastSuccessAt: string | null = null;

  function headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { Accept: "application/json" };
    if (options.bearerToken) {
      h.Authorization = `Bearer ${options.bearerToken}`;
      h.apikey = options.bearerToken;
    }
    return { ...h, ...extra };
  }

  async function query(params: string): Promise<RawRecord[]> {
    if (!integrationEnabled) {
      throw new Error("Supabase time-log integration is not enabled.");
    }
    const url = `${baseUrl}?${params}`;
    const response = await fetch(url, { headers: headers() });
    if (!response.ok) {
      throw new Error(`Supabase time-log read failed with ${response.status}.`);
    }
    const payload = await response.json();
    lastSuccessAt = new Date().toISOString();
    return extractRows(payload);
  }

  function normalizeAll(rows: RawRecord[]) {
    return rows
      .map((row, i) => normalizeRow(row, i))
      .filter((e): e is ReturnType<typeof timeLogEventSchema.parse> => e !== null);
  }

  return {
    isEnabled() {
      return integrationEnabled;
    },

    async getConnector() {
      if (!integrationEnabled) {
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "offline",
          lastSeenAt: new Date(0).toISOString(),
          lastSuccessAt: null,
          lastError: "Supabase time-log integration is not enabled.",
          capabilities: ["time-log-read", "time-point-lookup", "time-range-query"],
          exposureLevel: "private-personal"
        });
      }

      try {
        // Light probe: just check connectivity, don't pull data.
        await query("select=id&limit=1");
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "online",
          lastSeenAt: lastSuccessAt ?? new Date().toISOString(),
          lastSuccessAt,
          lastError: null,
          capabilities: ["time-log-read", "time-point-lookup", "time-range-query"],
          exposureLevel: "private-personal"
        });
      } catch (error) {
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "offline",
          lastSeenAt: new Date().toISOString(),
          lastSuccessAt,
          lastError: error instanceof Error ? error.message : "Supabase time-log connection failed.",
          capabilities: ["time-log-read", "time-point-lookup", "time-range-query"],
          exposureLevel: "private-personal"
        });
      }
    },

    async getRecent(limit = defaultRecentLimit) {
      const safeLimit = Math.max(1, Math.min(limit, 12));
      const rows = await query(`select=*&order=start_time.desc&limit=${safeLimit}`);
      return timeLogRecentSchema.parse({
        connectorId,
        fetchedAt: new Date().toISOString(),
        events: normalizeAll(rows)
      });
    },

    async lookupAt(input: unknown) {
      const payload = timeLogLookupInputSchema.parse(input);
      const target = payload.at;

      // 1) Look for an event whose interval covers the target.
      // start_time <= target AND (end_time >= target OR end_time IS NULL)
      const containsRows = await query(
        `select=*&start_time=lte.${target}` +
          `&or=(end_time.gte.${target},end_time.is.null)` +
          `&order=start_time.desc&limit=1`
      );
      const containing = normalizeAll(containsRows)[0];

      if (containing) {
        return timeLogLookupResultSchema.parse({
          connectorId,
          queriedAt: target,
          matched: true,
          strategy: "contains",
          message: "Found a time-log entry covering that moment.",
          event: containing,
          distanceMinutes: 0
        });
      }

      // 2) Fallback: nearest previous within window.
      const windowMs = nearestPreviousWindowDays * 24 * 60 * 60 * 1000;
      const windowStart = new Date(new Date(target).getTime() - windowMs).toISOString();
      const previousRows = await query(
        `select=*&start_time=lte.${target}&start_time=gte.${windowStart}` +
          `&order=start_time.desc&limit=1`
      );
      const previous = normalizeAll(previousRows)[0];

      if (previous) {
        const distanceMinutes = Math.max(
          0,
          Math.round(
            (new Date(target).getTime() - new Date(previous.startedAt).getTime()) / 60_000
          )
        );
        return timeLogLookupResultSchema.parse({
          connectorId,
          queriedAt: target,
          matched: true,
          strategy: "nearest-previous",
          message: `No covering entry; nearest previous entry is ${Math.round(distanceMinutes / 60)} hours earlier.`,
          event: previous,
          distanceMinutes
        });
      }

      return timeLogLookupResultSchema.parse({
        connectorId,
        queriedAt: target,
        matched: false,
        strategy: "not-found",
        message: `No time-log entry found within ${nearestPreviousWindowDays} days before ${target}.`,
        event: null,
        distanceMinutes: null
      });
    },

    async lookupRange(input: unknown) {
      const payload = timeLogRangeInputSchema.parse(input);
      if (new Date(payload.from).getTime() > new Date(payload.to).getTime()) {
        throw new Error("'from' must be earlier than 'to'.");
      }
      const limit = Math.max(1, Math.min(payload.limit ?? defaultRangeLimit, maxRangeLimit));
      // Overlap: event.start_time <= to AND (event.end_time >= from OR end_time IS NULL)
      const rows = await query(
        `select=*&start_time=lte.${payload.to}` +
          `&or=(end_time.gte.${payload.from},end_time.is.null)` +
          `&order=start_time.asc&limit=${limit}`
      );
      const events = normalizeAll(rows);
      return timeLogRangeSchema.parse({
        connectorId,
        queriedFrom: payload.from,
        queriedTo: payload.to,
        fetchedAt: new Date().toISOString(),
        total: events.length,
        truncated: events.length === limit,
        events
      });
    }
  };
}

export type SupabaseTimeLogClient = ReturnType<typeof createSupabaseTimeLogClient>;
