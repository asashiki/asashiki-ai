import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  locationCurrentSchema,
  locationHistorySchema,
  locationHistoryQueryInputSchema,
  archiveDiaryEntrySchema,
  archiveDiaryListSchema,
  archiveDiaryReadInputSchema,
  archiveFileDeleteInputSchema,
  archiveFileDeleteResultSchema,
  okxAccountBalanceSchema,
  okxAssetBalancesSchema,
  okxPositionsSchema,
  weatherSchema,
  steamRecentGamesSchema,
  steamPlayerSummarySchema,
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
  mcpToolCatalogSchema,
  mcpToolTestResultSchema,
  profileSummarySchema,
  recentContextSchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRangeInputSchema,
  timeLogRangeSchema
} from "@asashiki/schemas";
import { z } from "zod";
import type { CoreApiClient } from "./core-api-client.js";

// All timestamps in core-api are UTC ISO. Render them in Shanghai for the
// text content the model reads, while keeping structuredContent on raw UTC.
const shFmtHm = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const shFmtMdHm = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
function shHm(iso: string | null | undefined): string {
  if (!iso) return "??:??";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "??:??" : shFmtHm.format(d);
}
function shMdHm(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : shFmtMdHm.format(d);
}

const connectorStatusOutputSchema = z.object({
  summary: connectorSummarySchema,
  connectors: connectorSchema.array()
});

// Tool ID convention: <domain>_<action>.
// Domain groups related capabilities so model selection is easier; action is the verb.
// See apps/mcp-gateway/README.md for how to add a new tool.
const mcpToolIds = [
  "profile_read_summary",
  "context_recent",
  "journal_create_draft",
  "connector_status",
  "archive_status",
  "archive_list",
  "archive_read",
  "archive_write",
  "archive_delete",
  "archive_search",
  "diary_list",
  "diary_read",
  "diary_write",
  "diary_update",
  "diary_delete",
  "time_log_lookup",
  "time_log_range",
  "device_status",
  "device_activity_summary",
  "device_timeline",
  "health_summary",
  "health_records",
  "location_current",
  "location_history",
  "weather_current",
  "okx_balance",
  "okx_positions",
  "okx_assets",
  "steam_recent_games",
  "steam_profile",
  "voice_send"
] as const;

export const mcpToolIdSchema = z.enum(mcpToolIds);

export type McpToolId = z.infer<typeof mcpToolIdSchema>;

export const mcpToolCatalog = mcpToolCatalogSchema.parse([
  {
    id: "profile_read_summary",
    title: "Read Profile Summary",
    description: "Stable profile summary curated by Core API.",
    readOnlyHint: true
  },
  {
    id: "context_recent",
    title: "Recent Context",
    description: "Compact recent journals + safe status hints.",
    readOnlyHint: true
  },
  {
    id: "journal_create_draft",
    title: "Create Journal Draft",
    description: "Create a journal draft via Core API (audited).",
    readOnlyHint: false
  },
  {
    id: "connector_status",
    title: "Connector Status",
    description: "Connector summary and per-connector state.",
    readOnlyHint: true
  },
  {
    id: "archive_status",
    title: "Archive Status",
    description: "Check if Archive and diary folder are readable.",
    readOnlyHint: true
  },
  {
    id: "archive_list",
    title: "List Archive Files",
    description: "List files/subdirs in an Archive directory.",
    readOnlyHint: true
  },
  {
    id: "archive_read",
    title: "Read Archive File",
    description: "Read any Archive Markdown/text file by relative path.",
    readOnlyHint: true
  },
  {
    id: "archive_write",
    title: "Write Archive File",
    description: "Create or overwrite an Archive file by relative path.",
    readOnlyHint: false
  },
  {
    id: "archive_delete",
    title: "Delete Archive File",
    description: "Permanently delete an Archive file by relative path.",
    readOnlyHint: false
  },
  {
    id: "archive_search",
    title: "Search Archive",
    description: "Full-text search across Archive Markdown/text files.",
    readOnlyHint: true
  },
  {
    id: "diary_list",
    title: "List Diary Entries",
    description: "List recent diary entries from the Archive.",
    readOnlyHint: true
  },
  {
    id: "diary_read",
    title: "Read Diary Entry",
    description: "Read one diary entry by YYYY-MM-DD.",
    readOnlyHint: true
  },
  {
    id: "diary_write",
    title: "Write Diary Entry",
    description: "Create a new diary entry (YYYY-MM-DD.md).",
    readOnlyHint: false
  },
  {
    id: "diary_update",
    title: "Update Diary Entry",
    description: "Update an existing diary entry (replace or append).",
    readOnlyHint: false
  },
  {
    id: "diary_delete",
    title: "Delete Diary Entry",
    description: "Permanently delete a diary entry by date.",
    readOnlyHint: false
  },
  {
    id: "time_log_lookup",
    title: "Lookup Time Log",
    description: "What was I doing at a specific timestamp.",
    readOnlyHint: true
  },
  {
    id: "time_log_range",
    title: "Time Log Range",
    description: "List time-log events overlapping a [from, to] range.",
    readOnlyHint: true
  },
  {
    id: "device_status",
    title: "Device Status",
    description: "Current state of all registered devices.",
    readOnlyHint: true
  },
  {
    id: "device_activity_summary",
    title: "Device Activity Summary",
    description: "Per-app usage summary for a given date.",
    readOnlyHint: true
  },
  {
    id: "device_timeline",
    title: "Device Activity Timeline",
    description: "Chronological app-switch timeline for a given date.",
    readOnlyHint: true
  },
  {
    id: "health_summary",
    title: "Health Summary",
    description: "Latest safe health summary (no raw history).",
    readOnlyHint: true
  },
  {
    id: "health_records",
    title: "Health Records",
    description: "Query raw HealthConnect records, optionally filtered by type/date.",
    readOnlyHint: true
  },
  {
    id: "location_current",
    title: "Current Location",
    description: "Latest GPS location per registered device.",
    readOnlyHint: true
  },
  {
    id: "location_history",
    title: "Location History",
    description: "Chronological location trail, optionally filtered.",
    readOnlyHint: true
  },
  {
    id: "weather_current",
    title: "Current Weather",
    description: "Current weather and 4-day forecast.",
    readOnlyHint: true
  },
  {
    id: "okx_balance",
    title: "OKX Trading Balance",
    description: "OKX trading account equity and holdings.",
    readOnlyHint: true
  },
  {
    id: "okx_positions",
    title: "OKX Open Positions",
    description: "OKX open futures/perpetual positions.",
    readOnlyHint: true
  },
  {
    id: "okx_assets",
    title: "OKX Funding Assets",
    description: "OKX funding account asset balances.",
    readOnlyHint: true
  },
  {
    id: "steam_recent_games",
    title: "Steam Recent Games",
    description: "Steam games played in the last 2 weeks.",
    readOnlyHint: true
  },
  {
    id: "steam_profile",
    title: "Steam Profile",
    description: "Steam profile, online status, current game.",
    readOnlyHint: true
  },
  {
    id: "voice_send",
    title: "Send Voice Message",
    description: "Send a TTS voice notification to the Android phone.",
    readOnlyHint: false
  }
]);

function tool(id: McpToolId) {
  const entry = mcpToolCatalog.find((t) => t.id === id);
  if (!entry) throw new Error(`Missing catalog entry: ${id}`);
  return entry;
}

export function createMcpGatewayServer(client: CoreApiClient) {
  const server = new McpServer(
    {
      name: "asashiki-mcp-gateway",
      version: "0.1.0"
    },
    {
      instructions:
        "Use the exposed tools to read safe summaries from the Core API and create journal drafts through the backend write path."
    }
  );

  // ───────────── profile / context / journal ─────────────

  server.registerTool(
    "profile_read_summary",
    {
      title: tool("profile_read_summary").title,
      description: tool("profile_read_summary").description,
      inputSchema: z.object({}),
      outputSchema: profileSummarySchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getProfileSummary();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "context_recent",
    {
      title: tool("context_recent").title,
      description: tool("context_recent").description,
      inputSchema: z.object({}),
      outputSchema: recentContextSchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getRecentContext();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "journal_create_draft",
    {
      title: tool("journal_create_draft").title,
      description: tool("journal_create_draft").description,
      inputSchema: journalDraftInputSchema,
      outputSchema: journalDraftSavedSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input: z.infer<typeof journalDraftInputSchema>) => {
      const output = await client.createJournalDraft(input);
      return {
        content: [
          { type: "text", text: `Created journal draft ${output.id} (${output.title}).` }
        ],
        structuredContent: output
      };
    }
  );

  // ───────────── connector / archive ─────────────

  server.registerTool(
    "connector_status",
    {
      title: tool("connector_status").title,
      description: tool("connector_status").description,
      inputSchema: z.object({}),
      outputSchema: connectorStatusOutputSchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getConnectorStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_status",
    {
      title: tool("archive_status").title,
      description: tool("archive_status").description,
      inputSchema: z.object({}),
      outputSchema: archiveStatusSchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getArchiveStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_list",
    {
      title: tool("archive_list").title,
      description: tool("archive_list").description,
      inputSchema: archiveFileListInputSchema,
      outputSchema: archiveFileListResultSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof archiveFileListInputSchema>) => {
      const output = await client.listArchiveFiles(input);
      const summary = output.items.map((i) => `${i.isDir ? "[dir]" : "[file]"} ${i.path}`).join("\n");
      return {
        content: [{ type: "text", text: summary || "Empty directory." }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_read",
    {
      title: tool("archive_read").title,
      description: tool("archive_read").description,
      inputSchema: archiveFileReadInputSchema,
      outputSchema: archiveFileResultSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof archiveFileReadInputSchema>) => {
      const output = await client.readArchiveFile(input);
      return {
        content: [{ type: "text", text: output.content }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_write",
    {
      title: tool("archive_write").title,
      description: tool("archive_write").description,
      inputSchema: archiveFileWriteInputSchema,
      outputSchema: archiveFileWriteResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input: z.infer<typeof archiveFileWriteInputSchema>) => {
      const output = await client.writeArchiveFile(input);
      return {
        content: [
          { type: "text", text: `${output.mode === "create" ? "Created" : "Updated"} ${output.path} (${output.size} bytes).` }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_delete",
    {
      title: tool("archive_delete").title,
      description: tool("archive_delete").description,
      inputSchema: archiveFileDeleteInputSchema,
      outputSchema: archiveFileDeleteResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input: z.infer<typeof archiveFileDeleteInputSchema>) => {
      const output = await client.deleteArchiveFile(input);
      return {
        content: [
          { type: "text", text: output.deleted ? `Deleted ${output.path}.` : `Not found: ${output.path}.` }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "archive_search",
    {
      title: tool("archive_search").title,
      description: tool("archive_search").description,
      inputSchema: archiveSearchInputSchema,
      outputSchema: archiveSearchResultSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof archiveSearchInputSchema>) => {
      const output = await client.searchArchive(input);
      const preview = output.hits.map((h) => `[${h.path}] ${h.excerpt}`).join("\n\n");
      return {
        content: [{ type: "text", text: preview || `No results for "${output.query}".` }],
        structuredContent: output
      };
    }
  );

  // ───────────── diary ─────────────

  server.registerTool(
    "diary_list",
    {
      title: tool("diary_list").title,
      description: tool("diary_list").description,
      inputSchema: z.object({
        limit: z.coerce.number().int().positive().max(50).optional()
      }),
      outputSchema: archiveDiaryListSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: { limit?: number }) => {
      const output = await client.listDiaryEntries(input.limit ?? 20);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "diary_read",
    {
      title: tool("diary_read").title,
      description: tool("diary_read").description,
      inputSchema: archiveDiaryReadInputSchema,
      outputSchema: archiveDiaryEntrySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof archiveDiaryReadInputSchema>) => {
      const output = await client.readDiaryEntry(input);
      return {
        content: [{ type: "text", text: output.content }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "diary_write",
    {
      title: tool("diary_write").title,
      description: tool("diary_write").description,
      inputSchema: diaryWriteInputSchema,
      outputSchema: diaryWriteResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input: z.infer<typeof diaryWriteInputSchema>) => {
      const output = await client.writeDiaryEntry(input);
      return {
        content: [
          { type: "text", text: `Diary entry ${output.date} written (${output.mode}, ${output.bytesWritten} bytes).` }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "diary_update",
    {
      title: tool("diary_update").title,
      description: tool("diary_update").description,
      inputSchema: diaryUpdateInputSchema,
      outputSchema: diaryWriteResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (input: z.infer<typeof diaryUpdateInputSchema>) => {
      const output = await client.updateDiaryEntry(input);
      return {
        content: [
          { type: "text", text: `Diary entry ${output.date} updated (${output.mode}, ${output.bytesWritten} bytes).` }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "diary_delete",
    {
      title: tool("diary_delete").title,
      description: tool("diary_delete").description,
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      outputSchema: diaryDeleteResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async (input: { date: string }) => {
      const output = await client.deleteDiaryEntry(input.date);
      return {
        content: [
          { type: "text", text: output.deleted ? `Deleted ${output.path}.` : `Not found: ${output.path}.` }
        ],
        structuredContent: output
      };
    }
  );

  // ───────────── time log / device / health ─────────────

  server.registerTool(
    "time_log_lookup",
    {
      title: tool("time_log_lookup").title,
      description: tool("time_log_lookup").description,
      inputSchema: timeLogLookupInputSchema,
      outputSchema: timeLogLookupResultSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof timeLogLookupInputSchema>) => {
      const output = await client.lookupTimeLogAt(input);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "time_log_range",
    {
      title: tool("time_log_range").title,
      description: tool("time_log_range").description,
      inputSchema: timeLogRangeInputSchema,
      outputSchema: timeLogRangeSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof timeLogRangeInputSchema>) => {
      const output = await client.lookupTimeLogRange(input);
      if (output.events.length === 0) {
        return {
          content: [{ type: "text", text: `[${output.queriedFrom} → ${output.queriedTo}] 暂无时间日志。` }],
          structuredContent: output
        };
      }
      const head = output.events.slice(0, 30).map((e) =>
        `${e.startedAt}${e.endedAt ? ` → ${e.endedAt}` : ""}  ${e.title}${e.note ? ` // ${e.note}` : ""}`
      ).join("\n");
      const text =
        `[${output.queriedFrom} → ${output.queriedTo}] 共 ${output.total} 条${output.truncated ? "（已截断到上限）" : ""}：\n${head}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "device_status",
    {
      title: tool("device_status").title,
      description: tool("device_status").description,
      inputSchema: z.object({}),
      outputSchema: deviceCurrentSchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getDeviceCurrent();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "device_activity_summary",
    {
      title: tool("device_activity_summary").title,
      description: tool("device_activity_summary").description,
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      }),
      outputSchema: deviceActivitySummarySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: { date?: string }) => {
      const output = await client.getDeviceActivitySummary(input.date);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "device_timeline",
    {
      title: tool("device_timeline").title,
      description: tool("device_timeline").description,
      inputSchema: deviceTimelineInputSchema,
      outputSchema: deviceTimelineSchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof deviceTimelineInputSchema>) => {
      const output = await client.getDeviceTimeline(input);
      const acts = output.activities ?? [];
      const head = acts.slice(0, 20).map((a) => {
        const mins = a.endedAt
          ? Math.max(1, Math.round((Date.parse(a.endedAt) - Date.parse(a.startedAt)) / 60000))
          : null;
        return `${shHm(a.startedAt)} ${a.appId ?? "?"}${mins != null ? ` (${mins}m)` : ""}`;
      }).join("\n");
      const text = acts.length === 0
        ? `${output.date} 暂无活动记录。`
        : `${output.date} 共 ${acts.length} 条活动，前 ${Math.min(20, acts.length)} 条：\n${head}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "health_summary",
    {
      title: tool("health_summary").title,
      description: tool("health_summary").description,
      inputSchema: z.object({}),
      outputSchema: healthSummarySchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getHealthSummary();
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "health_records",
    {
      title: tool("health_records").title,
      description: tool("health_records").description,
      inputSchema: healthRecordsQueryInputSchema,
      outputSchema: healthRecordsQuerySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof healthRecordsQueryInputSchema>) => {
      const output = await client.getHealthRecords(input);
      if (output.records.length === 0) {
        return {
          content: [{ type: "text", text: "该条件下暂无健康记录。" }],
          structuredContent: output
        };
      }
      const head = output.records.slice(0, 30).map((r) => {
        const v = r.value ?? (r.valueJson != null ? JSON.stringify(r.valueJson) : "?");
        return `${shMdHm(r.recordedAt)} ${r.type}=${v}${r.unit ? r.unit : ""}`;
      }).join("\n");
      const text = `共 ${output.records.length} 条健康记录，前 ${Math.min(30, output.records.length)} 条：\n${head}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );

  // ───────────── location / weather ─────────────

  server.registerTool(
    "location_current",
    {
      title: tool("location_current").title,
      description: tool("location_current").description,
      inputSchema: z.object({}),
      outputSchema: locationCurrentSchema,
      annotations: { readOnlyHint: true }
    },
    async () => {
      const output = await client.getLocationCurrent();
      const summary = output.devices.length === 0
        ? "暂无位置数据。请确保 Android App 已开启位置追踪。"
        : output.devices.map((d) => {
            const speed = d.speedMps != null ? ` 速度${(d.speedMps * 3.6).toFixed(1)}km/h` : "";
            return `${d.deviceId}: ${d.lat.toFixed(5)},${d.lon.toFixed(5)}${speed} @ ${shMdHm(d.recordedAt)}`;
          }).join("\n");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "location_history",
    {
      title: tool("location_history").title,
      description: tool("location_history").description,
      inputSchema: locationHistoryQueryInputSchema,
      outputSchema: locationHistorySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof locationHistoryQueryInputSchema>) => {
      const output = await client.getLocationHistory(input);
      if (output.total === 0) {
        return {
          content: [{ type: "text", text: "该时段内无位置记录。" }],
          structuredContent: output
        };
      }
      const head = output.points.slice(0, 20).map((p) =>
        `${shMdHm(p.recordedAt)} ${p.lat.toFixed(5)},${p.lon.toFixed(5)}${p.speedMps != null ? ` ${(p.speedMps * 3.6).toFixed(1)}km/h` : ""}`
      ).join("\n");
      const text = `共 ${output.total} 个位置点，最新 ${Math.min(20, output.points.length)} 条：\n${head}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "weather_current",
    {
      title: tool("weather_current").title,
      description: tool("weather_current").description,
      inputSchema: z.object({}),
      outputSchema: weatherSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getWeather();
      const c = output.current;
      const forecastStr = output.forecast
        .slice(1, 4)
        .map((d) => `${d.date}: ${d.minC}~${d.maxC}°C ${d.description}`)
        .join(" | ");
      const text = `${output.location} 当前: ${c.temperatureC}°C (体感${c.feelsLikeC}°C) ${c.description} 湿度${c.humidity}% | 未来: ${forecastStr}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    }
  );

  // ───────────── okx ─────────────

  server.registerTool(
    "okx_balance",
    {
      title: tool("okx_balance").title,
      description: tool("okx_balance").description,
      inputSchema: z.object({}),
      outputSchema: okxAccountBalanceSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getOkxBalance();
      const top = output.holdings.slice(0, 3).map((h) => `${h.currency}=${(h.valueUsd ?? 0).toFixed(0)}U`).join(" ");
      return {
        content: [{ type: "text", text: `总权益: $${output.totalEquityUsd.toFixed(2)} | ${top}` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "okx_positions",
    {
      title: tool("okx_positions").title,
      description: tool("okx_positions").description,
      inputSchema: z.object({}),
      outputSchema: okxPositionsSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getOkxPositions();
      const summary = output.positions.length === 0
        ? "当前无持仓。"
        : output.positions.map((p) => `${p.instrument} ${p.side} PnL=${p.unrealizedPnl.toFixed(2)}U`).join("\n");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "okx_assets",
    {
      title: tool("okx_assets").title,
      description: tool("okx_assets").description,
      inputSchema: z.object({}),
      outputSchema: okxAssetBalancesSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getOkxAssets();
      const summary = output.assets.length === 0
        ? "资金账户为空。"
        : output.assets.map((a) => `${a.currency}: ${a.balance}`).join(", ");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  // ───────────── steam ─────────────

  server.registerTool(
    "steam_recent_games",
    {
      title: tool("steam_recent_games").title,
      description: tool("steam_recent_games").description,
      inputSchema: z.object({}),
      outputSchema: steamRecentGamesSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getSteamRecentGames();
      const summary = output.games.length === 0
        ? "最近两周没有游戏记录。"
        : output.games.map((g) => `${g.name}: ${Math.round(g.playtime2WeeksMinutes / 60 * 10) / 10}h`).join(", ");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "steam_profile",
    {
      title: tool("steam_profile").title,
      description: tool("steam_profile").description,
      inputSchema: z.object({}),
      outputSchema: steamPlayerSummarySchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async () => {
      const output = await client.getSteamProfile();
      const playing = output.currentGame ? ` | 正在玩: ${output.currentGame}` : "";
      return {
        content: [{ type: "text", text: `${output.displayName} (${output.status})${playing}` }],
        structuredContent: output
      };
    }
  );

  // ───────────── voice ─────────────

  server.registerTool(
    "voice_send",
    {
      title: tool("voice_send").title,
      description: tool("voice_send").description,
      inputSchema: z.object({
        deviceId: z.string().min(1).describe("Target device id, e.g. 'android-phone'"),
        senderName: z.string().min(1).describe("Your AI name as it appears in the notification, e.g. 'Claude'"),
        senderAvatarUrl: z.string().url().optional().describe("Optional avatar image URL"),
        text: z.string().min(1).max(300).describe("Spoken text, 1-300 chars; Chinese works best. One sentence is ideal.")
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (input) => {
      const result = await client.sendVoiceMessage(input);
      return {
        content: [{ type: "text", text: `Voice message queued (id=${(result as any).id}, ${(result as any).audioBytes ?? "?"} bytes). Will be picked up by ${input.deviceId} on next poll (≤ 10s).` }]
      };
    }
  );

  return server;
}

export async function runMcpToolSmokeTest(
  client: CoreApiClient,
  toolId: McpToolId
) {
  const executedAt = new Date().toISOString();

  try {
    switch (toolId) {
      case "profile_read_summary": {
        const output = await client.getProfileSummary();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.displayName} 的 profile summary。`,
          preview: output.summary,
          executedAt
        });
      }
      case "context_recent": {
        const output = await client.getRecentContext();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.recentDraftTitles.length} 条最近 draft 提示。`,
          preview: output.statusHints[0] ?? output.summary,
          executedAt
        });
      }
      case "journal_create_draft": {
        const output = await client.createJournalDraft({
          title: "Admin MCP smoke",
          content: "Created through the admin control room smoke flow.",
          source: "admin-mcp-test"
        });
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `成功创建 draft ${output.id}。`,
          preview: output.title,
          executedAt
        });
      }
      case "health_summary": {
        const output = await client.getHealthSummary();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "读取到最新健康摘要。",
          preview: `steps=${output.stepCount ?? "n/a"} · sleep=${output.sleepHours ?? "n/a"}`,
          executedAt
        });
      }
      case "connector_status": {
        const output = await client.getConnectorStatus();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `连接器在线 ${output.summary.online}/${output.summary.total}。`,
          preview: output.connectors[0]?.name ?? "No connectors returned.",
          executedAt
        });
      }
      case "archive_status": {
        const output = await client.getArchiveStatus();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `Archive 状态：${output.status}。`,
          preview: output.diaryPath ?? output.lastError,
          executedAt
        });
      }
      case "diary_list": {
        const output = await client.listDiaryEntries(5);
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.entries.length} 条日记索引。`,
          preview: output.entries[0]?.title ?? "Archive diary is empty.",
          executedAt
        });
      }
      case "diary_read": {
        const list = await client.listDiaryEntries(1);
        const first = list.entries[0];

        if (!first) {
          return mcpToolTestResultSchema.parse({
            toolId,
            ok: false,
            summary: "Archive 中没有可读取的日记文件。",
            preview: null,
            executedAt
          });
        }

        const output = await client.readDiaryEntry({
          date: first.date
        });
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.date} 的日记。`,
          preview: output.excerpt,
          executedAt
        });
      }
      case "time_log_lookup": {
        const output = await client.lookupTimeLogAt({
          at: new Date().toISOString()
        });
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: output.matched
            ? "时间日志查询成功。"
            : "时间日志查询成功，但当前时刻没有匹配记录。",
          preview: output.event?.title ?? output.message,
          executedAt
        });
      }
      case "time_log_range": {
        const now = Date.now();
        const output = await client.lookupTimeLogRange({
          from: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date(now).toISOString(),
          limit: 5
        });
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `时间日志区间查询成功：近 7 天 ${output.total} 条。`,
          preview: output.events[0]?.title ?? "暂无记录。",
          executedAt
        });
      }
      case "device_status": {
        const output = await client.getDeviceCurrent();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.devices.length} 台设备状态。`,
          preview: output.devices[0]
            ? `${output.devices[0].deviceName}: ${output.devices[0].appId ?? "idle"}`
            : "暂无设备上报记录。",
          executedAt
        });
      }
      case "device_activity_summary": {
        const output = await client.getDeviceActivitySummary();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `今日活动：${output.perApp.length} 款应用，共 ${Math.round(output.totalSeconds / 60)} 分钟。`,
          preview: output.perApp[0]
            ? `${output.perApp[0].appId}: ${Math.round(output.perApp[0].totalSeconds / 60)} 分钟`
            : "今日暂无活动记录。",
          executedAt
        });
      }
      case "device_timeline": {
        const output = await client.getDeviceTimeline({});
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `设备时间线：${output.activities?.length ?? 0} 条活动记录。`,
          preview: output.activities?.[0]?.appId ?? "暂无记录。",
          executedAt
        });
      }
      case "health_records": {
        const output = await client.getHealthRecords({ limit: 3 });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `健康记录：${output.records.length} 条。`,
          preview: output.records[0] ? `${output.records[0].type}: ${output.records[0].value}` : "暂无。",
          executedAt
        });
      }
      case "archive_list": {
        const output = await client.listArchiveFiles({});
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `Archive 顶层：${output.items.length} 个条目。`,
          preview: output.items.map((i) => i.name).join(", "),
          executedAt
        });
      }
      case "archive_read": {
        const output = await client.readArchiveFile({ path: "Obsidian_Asashiki/00-索引.md" });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `读取 ${output.path}，${output.size} 字节。`,
          preview: output.content.slice(0, 80),
          executedAt
        });
      }
      case "okx_balance": {
        const output = await client.getOkxBalance();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `OKX 账户权益 $${output.totalEquityUsd.toFixed(2)}，${output.holdings.length} 个币种持仓。`,
          preview: output.holdings[0] ? `${output.holdings[0].currency}: $${(output.holdings[0].valueUsd ?? 0).toFixed(2)}` : "无持仓",
          executedAt
        });
      }
      case "okx_positions": {
        const output = await client.getOkxPositions();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: output.positions.length === 0 ? "当前无持仓。" : `${output.positions.length} 个持仓。`,
          preview: output.positions[0]?.instrument ?? "无",
          executedAt
        });
      }
      case "okx_assets": {
        const output = await client.getOkxAssets();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `资金账户 ${output.assets.length} 个资产。`,
          preview: output.assets[0] ? `${output.assets[0].currency}: ${output.assets[0].balance}` : "空",
          executedAt
        });
      }
      case "archive_search": {
        const output = await client.searchArchive({ query: "日记", limit: 3 });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `搜索"日记"：${output.total} 条命中。`,
          preview: output.hits[0]?.excerpt ?? "暂无结果。",
          executedAt
        });
      }
      case "archive_write":
      case "archive_delete":
      case "diary_delete":
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `${toolId} smoke test 跳过（避免改动真实文件）。`,
          preview: null,
          executedAt
        });
      case "diary_write":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "diary_write smoke test 跳过（避免产生真实文件）。",
          preview: null,
          executedAt
        });
      case "diary_update":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "diary_update smoke test 跳过（避免改动真实文件）。",
          preview: null,
          executedAt
        });
      default:
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: false,
          summary: `${toolId} 暂无 smoke test 实现。`,
          preview: null,
          executedAt
        });
    }
  } catch (error) {
    return mcpToolTestResultSchema.parse({
      toolId,
      ok: false,
      summary:
        error instanceof Error ? error.message : "执行 MCP smoke test 时发生未知错误。",
      preview: null,
      executedAt
    });
  }
}
