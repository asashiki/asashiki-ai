import {
  connectorSchema,
  timeLogEventSchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRecentSchema
} from "@asashiki/schemas";

type RawRecord = Record<string, unknown>;

type TimeLogCache = {
  fetchedAt: string;
  expiresAt: number;
  events: ReturnType<typeof timeLogEventSchema.parse>[];
};

export type SupabaseTimeLogClientOptions = {
  url?: string;
  bearerToken?: string;
  connectorId?: string;
  connectorName?: string;
  cacheTtlMs?: number;
};

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

  if (!record) {
    return [];
  }

  const containerKeys = ["data", "rows", "result", "items", "records"];
  for (const key of containerKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate
        .map(asRecord)
        .filter((row): row is RawRecord => row !== null);
    }
  }

  return [];
}

function normalizeRow(row: RawRecord, fallbackIndex: number) {
  const startedAt = toIsoDate(
    row.started_at ??
      row.start_at ??
      row.start_time ??
      row.occurred_at ??
      row.occurredAt ??
      row.timestamp ??
      row.at ??
      row.created_at
  );

  if (!startedAt) {
    return null;
  }

  const endedAt = toIsoDate(
    row.ended_at ?? row.end_at ?? row.end_time ?? row.finished_at ?? row.updated_at
  );
  const title =
    pickString(row, [
      "title",
      "activity",
      "activity_name",
      "label",
      "name",
      "event",
      "type"
    ]) ?? `time-event-${fallbackIndex + 1}`;
  const note = pickString(row, [
    "note",
    "notes",
    "description",
    "details",
    "content",
    "summary",
    "comment"
  ]);
  const rawPreview =
    note ??
    pickString(row, ["context", "status", "location", "project", "category"]);

  return timeLogEventSchema.parse({
    id:
      pickString(row, ["id", "uuid", "event_id"]) ??
      `${startedAt}-${fallbackIndex + 1}`,
    title,
    startedAt,
    endedAt,
    note,
    source: pickString(row, ["source", "origin"]) ?? "supabase-time-log",
    tags: pickStringArray(row, ["tags", "tag_list", "categories"]),
    rawPreview
  });
}

export function createSupabaseTimeLogClient(options: SupabaseTimeLogClientOptions) {
  const connectorId = options.connectorId ?? "connector-supabase-time-log";
  const connectorName = options.connectorName ?? "Supabase 时间日志";
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  let cache: TimeLogCache | null = null;

  async function fetchEvents(force = false) {
    if (!options.url) {
      throw new Error("Supabase 时间日志 URL 未配置。");
    }

    if (!force && cache && cache.expiresAt > Date.now()) {
      return cache;
    }

    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (options.bearerToken) {
      headers.Authorization = `Bearer ${options.bearerToken}`;
      headers.apikey = options.bearerToken;
    }

    const response = await fetch(options.url, {
      headers
    });

    if (!response.ok) {
      throw new Error(`Supabase 时间日志读取失败，响应 ${response.status}。`);
    }

    const payload = await response.json();
    const rows = extractRows(payload);
    const events = rows
      .map(normalizeRow)
      .filter(
        (event): event is ReturnType<typeof timeLogEventSchema.parse> =>
          event !== null
      )
      .sort(
        (left, right) =>
          new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
      );

    cache = {
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + cacheTtlMs,
      events
    };

    return cache;
  }

  return {
    async getConnector() {
      if (!options.url) {
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "offline",
          lastSeenAt: new Date(0).toISOString(),
          lastSuccessAt: null,
          lastError: "Supabase 时间日志 URL 未配置。",
          capabilities: ["time-log-read", "time-point-lookup"],
          exposureLevel: "private-personal"
        });
      }

      try {
        const snapshot = await fetchEvents();
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "online",
          lastSeenAt: snapshot.fetchedAt,
          lastSuccessAt: snapshot.fetchedAt,
          lastError: null,
          capabilities: ["time-log-read", "time-point-lookup"],
          exposureLevel: "private-personal"
        });
      } catch (error) {
        return connectorSchema.parse({
          id: connectorId,
          name: connectorName,
          kind: "supabase-time-log",
          status: "offline",
          lastSeenAt: new Date().toISOString(),
          lastSuccessAt: cache?.fetchedAt ?? null,
          lastError:
            error instanceof Error
              ? error.message
              : "Supabase 时间日志连接失败。",
          capabilities: ["time-log-read", "time-point-lookup"],
          exposureLevel: "private-personal"
        });
      }
    },

    async getRecent(limit = 5) {
      const snapshot = await fetchEvents();
      return timeLogRecentSchema.parse({
        connectorId,
        fetchedAt: snapshot.fetchedAt,
        events: snapshot.events.slice(0, Math.max(1, Math.min(limit, 12)))
      });
    },

    async lookupAt(input: unknown) {
      const payload = timeLogLookupInputSchema.parse(input);
      const snapshot = await fetchEvents();
      const target = new Date(payload.at).getTime();

      const containing = snapshot.events.find((event) => {
        const start = new Date(event.startedAt).getTime();
        const end = event.endedAt
          ? new Date(event.endedAt).getTime()
          : new Date(event.startedAt).getTime();

        return target >= start && target <= end;
      });

      if (containing) {
        return timeLogLookupResultSchema.parse({
          connectorId,
          queriedAt: payload.at,
          matched: true,
          strategy: "contains",
          message: "找到了覆盖这个时刻的时间日志。",
          event: containing,
          distanceMinutes: 0
        });
      }

      const previous = snapshot.events
        .filter((event) => new Date(event.startedAt).getTime() <= target)
        .sort(
          (left, right) =>
            new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
        )[0];

      if (previous) {
        const distanceMinutes = Math.max(
          0,
          Math.round(
            (target - new Date(previous.startedAt).getTime()) / 60_000
          )
        );

        if (distanceMinutes <= 24 * 60) {
          return timeLogLookupResultSchema.parse({
            connectorId,
            queriedAt: payload.at,
            matched: true,
            strategy: "nearest-previous",
            message: "没有精确覆盖记录，已返回这个时刻之前最近的一条时间日志。",
            event: previous,
            distanceMinutes
          });
        }
      }

      return timeLogLookupResultSchema.parse({
        connectorId,
        queriedAt: payload.at,
        matched: false,
        strategy: "not-found",
        message: "这个时刻附近没有找到可用时间日志。",
        event: null,
        distanceMinutes: null
      });
    }
  };
}

export type SupabaseTimeLogClient = ReturnType<typeof createSupabaseTimeLogClient>;
