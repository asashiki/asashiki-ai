import {
  archiveDiaryEntrySchema,
  archiveDiaryListSchema,
  archiveDiaryReadInputSchema,
  archiveFileDeleteInputSchema,
  archiveFileDeleteResultSchema,
  okxAccountBalanceSchema,
  okxAssetBalancesSchema,
  okxPositionsSchema,
  archiveFileListInputSchema,
  archiveFileListResultSchema,
  archiveFileReadInputSchema,
  archiveFileResultSchema,
  archiveFileWriteInputSchema,
  archiveFileWriteResultSchema,
  archiveSearchInputSchema,
  archiveSearchResultSchema,
  archiveStatusSchema,
  connectorSchema,
  connectorSummarySchema,
  deviceActivitySummarySchema,
  deviceCurrentSchema,
  deviceTimelineInputSchema,
  deviceTimelineSchema,
  diaryDeleteResultSchema,
  diaryUpdateInputSchema,
  diaryWriteInputSchema,
  diaryWriteResultSchema,
  healthRecordsQueryInputSchema,
  healthRecordsQuerySchema,
  healthSummarySchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  profileSummarySchema,
  recentContextSchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRecentSchema
} from "@asashiki/schemas";

function resolveUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function createCoreApiClient(baseUrl: string) {
  return {
    async getProfileSummary() {
      const response = await fetch(resolveUrl(baseUrl, "/api/profile/summary"));

      if (!response.ok) {
        throw new Error("Failed to load profile summary from Core API.");
      }

      return profileSummarySchema.parse(await response.json());
    },

    async getRecentContext() {
      const response = await fetch(resolveUrl(baseUrl, "/api/context/recent"));

      if (!response.ok) {
        throw new Error("Failed to load recent context from Core API.");
      }

      return recentContextSchema.parse(await response.json());
    },

    async createJournalDraft(input: unknown) {
      const baseInput =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : {};

      const payload = journalDraftInputSchema.parse({
        ...baseInput,
        source:
          typeof baseInput.source === "string"
            ? baseInput.source
            : "mcp-gateway"
      });

      const response = await fetch(resolveUrl(baseUrl, "/api/journals/drafts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to create journal draft via Core API.");
      }

      return journalDraftSavedSchema.parse(await response.json());
    },

    async getHealthSummary() {
      const response = await fetch(resolveUrl(baseUrl, "/api/health/summary"));

      if (!response.ok) {
        throw new Error("Failed to load health summary from Core API.");
      }

      return healthSummarySchema.parse(await response.json());
    },

    async getConnectorStatus() {
      const [summaryResponse, connectorsResponse] = await Promise.all([
        fetch(resolveUrl(baseUrl, "/api/connectors/summary")),
        fetch(resolveUrl(baseUrl, "/api/connectors"))
      ]);

      if (!summaryResponse.ok || !connectorsResponse.ok) {
        throw new Error("Failed to load connector status from Core API.");
      }

      return {
        summary: connectorSummarySchema.parse(await summaryResponse.json()),
        connectors: connectorSchema.array().parse(await connectorsResponse.json())
      };
    },

    async getArchiveStatus() {
      const response = await fetch(resolveUrl(baseUrl, "/api/archive/status"));

      if (!response.ok) {
        throw new Error("Failed to load archive status from Core API.");
      }

      return archiveStatusSchema.parse(await response.json());
    },

    async listDiaryEntries(limit = 20) {
      const response = await fetch(
        resolveUrl(baseUrl, `/api/archive/diary?limit=${limit}`)
      );

      if (!response.ok) {
        throw new Error("Failed to list archive diary entries from Core API.");
      }

      return archiveDiaryListSchema.parse(await response.json());
    },

    async readDiaryEntry(input: unknown) {
      const payload = archiveDiaryReadInputSchema.parse(input);
      const response = await fetch(
        resolveUrl(
          baseUrl,
          `/api/archive/diary/${encodeURIComponent(payload.date)}`
        )
      );

      if (!response.ok) {
        throw new Error("Failed to read archive diary entry from Core API.");
      }

      return archiveDiaryEntrySchema.parse(await response.json());
    },

    async getRecentTimeLog(limit = 5) {
      const response = await fetch(
        resolveUrl(baseUrl, `/api/time-log/recent?limit=${limit}`)
      );

      if (!response.ok) {
        throw new Error("Failed to load Supabase time-log preview from Core API.");
      }

      return timeLogRecentSchema.parse(await response.json());
    },

    async lookupTimeLogAt(input: unknown) {
      const payload = timeLogLookupInputSchema.parse(input);
      const search = new URLSearchParams({ at: payload.at });
      const response = await fetch(
        resolveUrl(baseUrl, `/api/time-log/lookup?${search.toString()}`)
      );

      if (!response.ok) {
        throw new Error("Failed to query Supabase time-log through Core API.");
      }

      return timeLogLookupResultSchema.parse(await response.json());
    },

    async getDeviceCurrent() {
      const response = await fetch(resolveUrl(baseUrl, "/api/devices/current"));

      if (!response.ok) {
        throw new Error("Failed to load device status from Core API.");
      }

      return deviceCurrentSchema.parse(await response.json());
    },

    async getDeviceActivitySummary(date?: string) {
      const params = date ? `?date=${encodeURIComponent(date)}` : "";
      const response = await fetch(
        resolveUrl(baseUrl, `/api/devices/activity-summary${params}`)
      );

      if (!response.ok) {
        throw new Error("Failed to load device activity summary from Core API.");
      }

      return deviceActivitySummarySchema.parse(await response.json());
    },

    async getDeviceTimeline(date?: string) {
      const params = date ? `?date=${encodeURIComponent(date)}` : "";
      const response = await fetch(
        resolveUrl(baseUrl, `/api/devices/timeline${params}`)
      );

      if (!response.ok) {
        throw new Error("Failed to load device timeline from Core API.");
      }

      return deviceTimelineSchema.parse(await response.json());
    },

    async getHealthRecords(input: unknown) {
      const query = healthRecordsQueryInputSchema.parse(input ?? {});
      const params = new URLSearchParams();
      if (query.type) params.set("type", query.type);
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (query.deviceId) params.set("deviceId", query.deviceId);
      if (query.limit) params.set("limit", String(query.limit));
      const qs = params.toString();
      const response = await fetch(
        resolveUrl(baseUrl, `/api/devices/health${qs ? `?${qs}` : ""}`)
      );

      if (!response.ok) {
        throw new Error("Failed to load health records from Core API.");
      }

      return healthRecordsQuerySchema.parse(await response.json());
    },

    async writeDiaryEntry(input: unknown) {
      const payload = diaryWriteInputSchema.parse(input);
      const response = await fetch(resolveUrl(baseUrl, "/api/archive/diary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : "Failed to write diary entry via Core API."
        );
      }

      return diaryWriteResultSchema.parse(await response.json());
    },

    async updateDiaryEntry(input: unknown) {
      const payload = diaryUpdateInputSchema.parse(input);
      const response = await fetch(
        resolveUrl(baseUrl, `/api/archive/diary/${encodeURIComponent(payload.date)}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: payload.content, mode: payload.mode })
        }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : "Failed to update diary entry via Core API."
        );
      }

      return diaryWriteResultSchema.parse(await response.json());
    },

    async deleteDiaryEntry(date: string) {
      const response = await fetch(
        resolveUrl(baseUrl, `/api/archive/diary/${encodeURIComponent(date)}`),
        { method: "DELETE" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "Delete failed.");
      }
      return diaryDeleteResultSchema.parse(await response.json());
    },

    async readArchiveFile(input: unknown) {
      const { path } = archiveFileReadInputSchema.parse(input);
      const url = resolveUrl(baseUrl, `/api/archive/file?path=${encodeURIComponent(path)}`);
      const response = await fetch(url);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "File not found.");
      }
      return archiveFileResultSchema.parse(await response.json());
    },

    async writeArchiveFile(input: unknown) {
      const payload = archiveFileWriteInputSchema.parse(input);
      const response = await fetch(resolveUrl(baseUrl, "/api/archive/file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "Write failed.");
      }
      return archiveFileWriteResultSchema.parse(await response.json());
    },

    async listArchiveFiles(input: unknown) {
      const { dir } = archiveFileListInputSchema.parse(input);
      const qs = dir ? `?dir=${encodeURIComponent(dir)}` : "";
      const response = await fetch(resolveUrl(baseUrl, `/api/archive/files${qs}`));
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "List failed.");
      }
      return archiveFileListResultSchema.parse(await response.json());
    },

    async getOkxBalance() {
      const res = await fetch(resolveUrl(baseUrl, "/api/okx/balance"));
      if (!res.ok) throw new Error("OKX balance unavailable.");
      return okxAccountBalanceSchema.parse(await res.json());
    },

    async getOkxPositions() {
      const res = await fetch(resolveUrl(baseUrl, "/api/okx/positions"));
      if (!res.ok) throw new Error("OKX positions unavailable.");
      return okxPositionsSchema.parse(await res.json());
    },

    async getOkxAssets() {
      const res = await fetch(resolveUrl(baseUrl, "/api/okx/assets"));
      if (!res.ok) throw new Error("OKX asset balances unavailable.");
      return okxAssetBalancesSchema.parse(await res.json());
    },

    async deleteArchiveFile(input: unknown) {
      const { path } = archiveFileDeleteInputSchema.parse(input);
      const response = await fetch(
        resolveUrl(baseUrl, `/api/archive/file?path=${encodeURIComponent(path)}`),
        { method: "DELETE" }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "Delete failed.");
      }
      return archiveFileDeleteResultSchema.parse(await response.json());
    },

    async searchArchive(input: unknown) {
      const params = archiveSearchInputSchema.parse(input);
      const qs = new URLSearchParams({ query: params.query });
      if (params.dir) qs.set("dir", params.dir);
      if (params.limit) qs.set("limit", String(params.limit));
      const response = await fetch(resolveUrl(baseUrl, `/api/archive/search?${qs}`));
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.message === "string" ? body.message : "Search failed.");
      }
      return archiveSearchResultSchema.parse(await response.json());
    },

    async getDeviceTimeline(input: unknown) {
      const params = deviceTimelineInputSchema.parse(input);
      const qs = new URLSearchParams();
      if (params.date) qs.set("date", params.date);
      if (params.deviceId) qs.set("deviceId", params.deviceId);
      if (params.limit) qs.set("limit", String(params.limit));
      const response = await fetch(resolveUrl(baseUrl, `/api/devices/timeline-query?${qs}`));
      if (!response.ok) throw new Error("Failed to fetch device timeline.");
      return deviceTimelineSchema.parse(await response.json());
    },

    async getHealthRecords(input: unknown) {
      const params = healthRecordsQueryInputSchema.parse(input);
      const qs = new URLSearchParams();
      if (params.type) qs.set("type", params.type);
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      if (params.deviceId) qs.set("deviceId", params.deviceId);
      if (params.limit) qs.set("limit", String(params.limit));
      const response = await fetch(resolveUrl(baseUrl, `/api/devices/health-records?${qs}`));
      if (!response.ok) throw new Error("Failed to fetch health records.");
      return healthRecordsQuerySchema.parse(await response.json());
    }
  };
}

export type CoreApiClient = ReturnType<typeof createCoreApiClient>;
