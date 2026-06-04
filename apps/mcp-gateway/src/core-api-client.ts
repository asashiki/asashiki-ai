import {
  weatherSchema,
  locationCurrentSchema,
  locationHistorySchema,
  locationHistoryQueryInputSchema,
  okxAccountBalanceSchema,
  okxAssetBalancesSchema,
  okxPositionsSchema,
  steamRecentGamesSchema,
  steamPlayerSummarySchema,
  connectorSchema,
  connectorSummarySchema,
  deviceActivitySummarySchema,
  deviceCurrentSchema,
  deviceTimelineInputSchema,
  deviceTimelineSchema,
  diaryWriteInputSchema,
  diaryWriteResultSchema,
  voiceBubbleInputSchema,
  voiceBubbleResultSchema,
  healthRecordsQueryInputSchema,
  healthRecordsQuerySchema,
  healthSummarySchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRangeInputSchema,
  timeLogRangeSchema,
  timeLogRecentSchema,
  xSearchInputSchema,
  xSearchOutputSchema
} from "@asashiki/schemas";
import { z } from "zod";

function resolveUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export function createCoreApiClient(baseUrl: string, adminToken?: string) {
  return {
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

    async lookupTimeLogRange(input: unknown) {
      const payload = timeLogRangeInputSchema.parse(input);
      const search = new URLSearchParams({ from: payload.from, to: payload.to });
      if (payload.limit != null) search.set("limit", String(payload.limit));
      const response = await fetch(
        resolveUrl(baseUrl, `/api/time-log/range?${search.toString()}`)
      );

      if (!response.ok) {
        throw new Error("Failed to query Supabase time-log range through Core API.");
      }

      return timeLogRangeSchema.parse(await response.json());
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

    async writeDiaryEntry(input: unknown) {
      const payload = diaryWriteInputSchema.parse(input);
      const response = await fetch(resolveUrl(baseUrl, "/api/diary"), {
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

    async getLocationCurrent() {
      const res = await fetch(resolveUrl(baseUrl, "/api/devices/location/current"));
      if (!res.ok) throw new Error("Location unavailable.");
      return locationCurrentSchema.parse(await res.json());
    },

    async getLocationHistory(input: z.infer<typeof locationHistoryQueryInputSchema>) {
      const params = new URLSearchParams();
      if (input.deviceId) params.set("deviceId", input.deviceId);
      if (input.from) params.set("from", input.from);
      if (input.to) params.set("to", input.to);
      if (input.limit) params.set("limit", String(input.limit));
      const qs = params.toString();
      const res = await fetch(resolveUrl(baseUrl, `/api/devices/location/history${qs ? `?${qs}` : ""}`));
      if (!res.ok) throw new Error("Location history unavailable.");
      return locationHistorySchema.parse(await res.json());
    },

    async getWeather() {
      const res = await fetch(resolveUrl(baseUrl, "/api/weather"));
      if (!res.ok) throw new Error("Weather unavailable.");
      return weatherSchema.parse(await res.json());
    },

    async getSteamRecentGames() {
      const res = await fetch(resolveUrl(baseUrl, "/api/steam/recent-games"));
      if (!res.ok) throw new Error("Steam recent games unavailable.");
      return steamRecentGamesSchema.parse(await res.json());
    },

    async getSteamProfile() {
      const res = await fetch(resolveUrl(baseUrl, "/api/steam/profile"));
      if (!res.ok) throw new Error("Steam profile unavailable.");
      return steamPlayerSummarySchema.parse(await res.json());
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

    async listRemoteMcpServers(): Promise<Array<{
      id: string; name: string; url: string; description: string; status: string; lastError: string | null; toolCount: number;
      tools: Array<{ name: string; title: string | null; description: string | null; readOnlyHint: boolean; inputSchema: Record<string, unknown> }>;
    }>> {
      const res = await fetch(resolveUrl(baseUrl, "/api/remote-mcp/servers"));
      if (!res.ok) throw new Error("Failed to list remote MCP servers.");
      return (await res.json()) as never;
    },

    async addRemoteServer(config: Record<string, unknown>) {
      if (!adminToken) throw new Error("Admin token not configured.");
      const res = await fetch(resolveUrl(baseUrl, "/api/remote-mcp/servers"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
      return body;
    },

    async deleteRemoteServer(id: string) {
      if (!adminToken) throw new Error("Admin token not configured.");
      const res = await fetch(resolveUrl(baseUrl, `/api/remote-mcp/servers/${encodeURIComponent(id)}`), {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
      }
      return await res.json().catch(() => ({}));
    },

    async proxyRemoteMcpTool(serverId: string, toolName: string, args: Record<string, unknown>, allowWrite: boolean) {
      const res = await fetch(
        resolveUrl(baseUrl, `/api/remote-mcp/servers/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}/proxy`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arguments: args ?? {}, allowWrite })
        }
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
      return body as { content?: unknown[]; structuredContent?: unknown; isError?: boolean };
    },

    async createVoiceBubble(input: unknown) {
      if (!adminToken) throw new Error("Admin token not configured for voice bubble.");
      const params = voiceBubbleInputSchema.parse(input);
      const res = await fetch(resolveUrl(baseUrl, "/api/voice-bubble"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(params)
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
      }
      return voiceBubbleResultSchema.parse(body);
    },

    async searchX(input: unknown) {
      const params = xSearchInputSchema.parse(input);
      const res = await fetch(resolveUrl(baseUrl, "/api/x-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof body.message === "string" ? body.message : `HTTP ${res.status}`);
      }
      return xSearchOutputSchema.parse(body);
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
