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
  timeLogLookupResultSchema
} from "@asashiki/schemas";
import { z } from "zod";
import type { CoreApiClient } from "./core-api-client.js";

const connectorStatusOutputSchema = z.object({
  summary: connectorSummarySchema,
  connectors: connectorSchema.array()
});

const mcpToolIds = [
  "read_profile_summary",
  "get_recent_context",
  "create_journal_draft",
  "get_health_summary",
  "get_connector_status",
  "get_archive_status",
  "list_diary_entries",
  "read_diary_entry",
  "lookup_time_log_at",
  "get_device_status",
  "get_device_activity_summary",
  "get_device_timeline",
  "get_health_metrics",
  "get_health_records",
  "write_diary_entry",
  "update_diary_entry",
  "delete_diary_entry",
  "read_archive_file",
  "write_archive_file",
  "delete_archive_file",
  "list_archive_files",
  "search_archive",
  "get_okx_balance",
  "get_okx_positions",
  "get_okx_assets",
  "get_steam_recent_games",
  "get_steam_profile",
  "send_voice_message",
  "get_weather",
  "get_current_location",
  "get_location_history"
] as const;

export const mcpToolIdSchema = z.enum(mcpToolIds);

export type McpToolId = z.infer<typeof mcpToolIdSchema>;

export const mcpToolCatalog = mcpToolCatalogSchema.parse([
  {
    id: "read_profile_summary",
    title: "Read Profile Summary",
    description: "Read the stable profile summary curated by the Core API.",
    readOnlyHint: true
  },
  {
    id: "get_recent_context",
    title: "Get Recent Context",
    description:
      "Return a compact context summary assembled from recent journals and safe status hints.",
    readOnlyHint: true
  },
  {
    id: "create_journal_draft",
    title: "Create Journal Draft",
    description:
      "Create a journal draft through the Core API so storage and audit stay backend-governed.",
    readOnlyHint: false
  },
  {
    id: "get_health_summary",
    title: "Get Health Summary",
    description:
      "Read the latest safe health summary without exposing raw personal history.",
    readOnlyHint: true
  },
  {
    id: "get_connector_status",
    title: "Get Connector Status",
    description:
      "Return connector summary plus current connector states curated by the Core API.",
    readOnlyHint: true
  },
  {
    id: "get_archive_status",
    title: "Get Archive Status",
    description:
      "Check whether the VPS-mounted Asashiki Archive and diary folder are readable.",
    readOnlyHint: true
  },
  {
    id: "list_diary_entries",
    title: "List Diary Entries",
    description:
      "List recent Markdown diary entries from the VPS-mounted Asashiki Archive.",
    readOnlyHint: true
  },
  {
    id: "read_diary_entry",
    title: "Read Diary Entry",
    description:
      "Read one Markdown diary file from the Asashiki Archive by date using YYYY-MM-DD.",
    readOnlyHint: true
  },
  {
    id: "lookup_time_log_at",
    title: "Lookup Time Log At",
    description:
      "Look up the Supabase-backed time log around a specific timestamp through the Core API.",
    readOnlyHint: true
  },
  {
    id: "get_device_status",
    title: "Get Device Status",
    description:
      "Return the current state of all registered devices (phone, desktop, etc.) including the active app, battery, network, and last-seen time.",
    readOnlyHint: true
  },
  {
    id: "get_device_activity_summary",
    title: "Get Device Activity Summary",
    description:
      "Return a per-app usage summary for a given date (default: today). Shows total minutes and launch count per app across all devices.",
    readOnlyHint: true
  },
  {
    id: "get_health_metrics",
    title: "Get Health Metrics",
    description:
      "Query raw health records uploaded from HealthConnect (heart rate, steps, sleep, etc.). Supports filtering by type, date range, and device.",
    readOnlyHint: true
  },
  {
    id: "get_device_timeline",
    title: "Get Device Activity Timeline",
    description:
      "Return the chronological app-switch timeline for a given date (default: today). Shows each foreground app period with start/end times.",
    readOnlyHint: true
  },
  {
    id: "get_health_records",
    title: "Get Health Records",
    description:
      "Query raw health records from HealthConnect by type and/or date range. Returns individual timestamped measurements (e.g. every heart rate sample).",
    readOnlyHint: true
  },
  {
    id: "write_diary_entry",
    title: "Write Diary Entry",
    description:
      "Create a new Markdown diary file in the Archive (YYYY-MM-DD.md). Fails if the file already exists unless overwrite=true.",
    readOnlyHint: false
  },
  {
    id: "update_diary_entry",
    title: "Update Diary Entry",
    description:
      "Update an existing diary entry in the Archive. Supports replace (overwrite full content) or append (add to end).",
    readOnlyHint: false
  },
  {
    id: "delete_diary_entry",
    title: "Delete Diary Entry",
    description: "Permanently delete a diary entry file from the Archive by date (YYYY-MM-DD).",
    readOnlyHint: false
  },
  {
    id: "read_archive_file",
    title: "Read Archive File",
    description:
      "Read any Markdown or text file in the Archive by relative path (e.g. '关于我/profile.md', '主题/某主题.md'). Use list_archive_files to discover available paths.",
    readOnlyHint: true
  },
  {
    id: "write_archive_file",
    title: "Write Archive File",
    description:
      "Create or overwrite any file in the Archive by relative path. Use this to update profile.md, role cards, topic notes, etc.",
    readOnlyHint: false
  },
  {
    id: "list_archive_files",
    title: "List Archive Files",
    description:
      "List files and subdirectories within an Archive directory. Call with no arguments to see the top-level structure, or pass dir to drill down.",
    readOnlyHint: true
  },
  {
    id: "delete_archive_file",
    title: "Delete Archive File",
    description: "Permanently delete any file in the Archive by relative path.",
    readOnlyHint: false
  },
  {
    id: "get_okx_balance",
    title: "Get OKX Account Balance",
    description:
      "Return the trading account total equity (USD) and per-currency holdings from OKX. Read-only, IP-restricted.",
    readOnlyHint: true
  },
  {
    id: "get_okx_positions",
    title: "Get OKX Open Positions",
    description:
      "Return all open futures/perpetual positions on OKX including entry price, mark price, unrealized PnL, and leverage.",
    readOnlyHint: true
  },
  {
    id: "get_okx_assets",
    title: "Get OKX Funding Account Assets",
    description:
      "Return the funding account (资金账户) asset balances on OKX. Separate from the trading account.",
    readOnlyHint: true
  },
  {
    id: "get_current_location",
    title: "Get Current Location",
    description:
      "Return the latest GPS location for each registered device. Includes coordinates, accuracy, speed, and timestamp. Requires location tracking enabled on the Android app.",
    readOnlyHint: true
  },
  {
    id: "get_location_history",
    title: "Get Location History",
    description:
      "Return a chronological trail of location points. Optionally filter by deviceId, from/to timestamps (ISO8601), and limit. Useful for reconstructing commute routes or understanding movement patterns.",
    readOnlyHint: true
  },
  {
    id: "get_weather",
    title: "Get Current Weather",
    description:
      "Return current weather and 4-day forecast for the configured location (default: 嘉兴). Includes temperature, humidity, wind speed, precipitation, and WMO weather description in Chinese.",
    readOnlyHint: true
  },
  {
    id: "get_steam_recent_games",
    title: "Get Steam Recently Played Games",
    description:
      "Return games played in the last 2 weeks from Steam, including playtime in minutes. Also shows all-time playtime per game.",
    readOnlyHint: true
  },
  {
    id: "get_steam_profile",
    title: "Get Steam Player Profile",
    description:
      "Return the Steam player profile including display name, online status, current game being played, and last seen time.",
    readOnlyHint: true
  },
  {
    id: "send_voice_message",
    title: "Send Voice Message to Phone",
    description:
      "Send a TTS voice bubble notification to the user's Android phone. The text is synthesized via MiniMax (温柔的女性声音) and delivered as a heads-up notification — tap once to play. Use sparingly, only when a quick spoken update genuinely beats text. Required: deviceId (e.g. 'android-phone'), senderName (your AI name like 'Claude' / 'Codex'), text (1-300 chars Chinese works best). Optional: senderAvatarUrl.",
    readOnlyHint: false
  },
  {
    id: "search_archive",
    title: "Search Archive",
    description:
      "Full-text search across all Markdown and text files in the Archive. Optionally scope to a subdirectory (e.g. dir='Obsidian_Asashiki/日记' for diary only). Returns up to 20 matching excerpts.",
    readOnlyHint: true
  }
]);

const readProfileTool = mcpToolCatalog.find(
  (tool) => tool.id === "read_profile_summary"
)!;
const recentContextTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_recent_context"
)!;
const createDraftTool = mcpToolCatalog.find(
  (tool) => tool.id === "create_journal_draft"
)!;
const healthSummaryTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_health_summary"
)!;
const connectorStatusTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_connector_status"
)!;
const archiveStatusTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_archive_status"
)!;
const listDiaryEntriesTool = mcpToolCatalog.find(
  (tool) => tool.id === "list_diary_entries"
)!;
const readDiaryEntryTool = mcpToolCatalog.find(
  (tool) => tool.id === "read_diary_entry"
)!;
const lookupTimeLogTool = mcpToolCatalog.find(
  (tool) => tool.id === "lookup_time_log_at"
)!;
const getDeviceStatusTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_device_status"
)!;
const getDeviceActivitySummaryTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_device_activity_summary"
)!;
const getHealthMetricsTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_health_metrics"
)!;
const writeDiaryEntryTool = mcpToolCatalog.find(
  (tool) => tool.id === "write_diary_entry"
)!;
const updateDiaryEntryTool = mcpToolCatalog.find(
  (tool) => tool.id === "update_diary_entry"
)!;
const deleteDiaryEntryTool = mcpToolCatalog.find(
  (tool) => tool.id === "delete_diary_entry"
)!;
const getDeviceTimelineTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_device_timeline"
)!;
const getHealthRecordsTool = mcpToolCatalog.find(
  (tool) => tool.id === "get_health_records"
)!;
const readArchiveFileTool = mcpToolCatalog.find(
  (tool) => tool.id === "read_archive_file"
)!;
const writeArchiveFileTool = mcpToolCatalog.find(
  (tool) => tool.id === "write_archive_file"
)!;
const listArchiveFilesTool = mcpToolCatalog.find(
  (tool) => tool.id === "list_archive_files"
)!;
const deleteArchiveFileTool = mcpToolCatalog.find(
  (tool) => tool.id === "delete_archive_file"
)!;
const searchArchiveTool = mcpToolCatalog.find(
  (tool) => tool.id === "search_archive"
)!;
const getOkxBalanceTool = mcpToolCatalog.find((t) => t.id === "get_okx_balance")!;
const getOkxPositionsTool = mcpToolCatalog.find((t) => t.id === "get_okx_positions")!;
const getOkxAssetsTool = mcpToolCatalog.find((t) => t.id === "get_okx_assets")!;
const getCurrentLocationTool = mcpToolCatalog.find((t) => t.id === "get_current_location")!;
const getLocationHistoryTool = mcpToolCatalog.find((t) => t.id === "get_location_history")!;
const getWeatherTool = mcpToolCatalog.find((t) => t.id === "get_weather")!;
const getSteamRecentGamesTool = mcpToolCatalog.find((t) => t.id === "get_steam_recent_games")!;
const getSteamProfileTool = mcpToolCatalog.find((t) => t.id === "get_steam_profile")!;

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

  server.registerTool(
    "read_profile_summary",
    {
      title: readProfileTool.title,
      description: readProfileTool.description,
      inputSchema: z.object({}),
      outputSchema: profileSummarySchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const output = await client.getProfileSummary();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_recent_context",
    {
      title: recentContextTool.title,
      description: recentContextTool.description,
      inputSchema: z.object({}),
      outputSchema: recentContextSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const output = await client.getRecentContext();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "create_journal_draft",
    {
      title: createDraftTool.title,
      description: createDraftTool.description,
      inputSchema: journalDraftInputSchema,
      outputSchema: journalDraftSavedSchema
    },
    async (input: z.infer<typeof journalDraftInputSchema>) => {
      const output = await client.createJournalDraft(input);
      return {
        content: [
          {
            type: "text",
            text: `Created journal draft ${output.id} (${output.title}).`
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_health_summary",
    {
      title: healthSummaryTool.title,
      description: healthSummaryTool.description,
      inputSchema: z.object({}),
      outputSchema: healthSummarySchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const output = await client.getHealthSummary();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_connector_status",
    {
      title: connectorStatusTool.title,
      description: connectorStatusTool.description,
      inputSchema: z.object({}),
      outputSchema: connectorStatusOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const output = await client.getConnectorStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_archive_status",
    {
      title: archiveStatusTool.title,
      description: archiveStatusTool.description,
      inputSchema: z.object({}),
      outputSchema: archiveStatusSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const output = await client.getArchiveStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "list_diary_entries",
    {
      title: listDiaryEntriesTool.title,
      description: listDiaryEntriesTool.description,
      inputSchema: z.object({
        limit: z.number().int().positive().max(50).optional()
      }),
      outputSchema: archiveDiaryListSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (input: { limit?: number }) => {
      const output = await client.listDiaryEntries(input.limit ?? 20);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "read_diary_entry",
    {
      title: readDiaryEntryTool.title,
      description: readDiaryEntryTool.description,
      inputSchema: archiveDiaryReadInputSchema,
      outputSchema: archiveDiaryEntrySchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (input: z.infer<typeof archiveDiaryReadInputSchema>) => {
      const output = await client.readDiaryEntry(input);
      return {
        content: [
          {
            type: "text",
            text: output.content
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "lookup_time_log_at",
    {
      title: lookupTimeLogTool.title,
      description: lookupTimeLogTool.description,
      inputSchema: timeLogLookupInputSchema,
      outputSchema: timeLogLookupResultSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (input: z.infer<typeof timeLogLookupInputSchema>) => {
      const output = await client.lookupTimeLogAt(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2)
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_device_status",
    {
      title: getDeviceStatusTool.title,
      description: getDeviceStatusTool.description,
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
    "get_device_activity_summary",
    {
      title: getDeviceActivitySummaryTool.title,
      description: getDeviceActivitySummaryTool.description,
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
    "get_health_metrics",
    {
      title: getHealthMetricsTool.title,
      description: getHealthMetricsTool.description,
      inputSchema: healthRecordsQueryInputSchema,
      outputSchema: healthRecordsQuerySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof healthRecordsQueryInputSchema>) => {
      const output = await client.getHealthRecords(input);
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "write_diary_entry",
    {
      title: writeDiaryEntryTool.title,
      description: writeDiaryEntryTool.description,
      inputSchema: diaryWriteInputSchema,
      outputSchema: diaryWriteResultSchema
    },
    async (input: z.infer<typeof diaryWriteInputSchema>) => {
      const output = await client.writeDiaryEntry(input);
      return {
        content: [
          {
            type: "text",
            text: `Diary entry ${output.date} written (${output.mode}, ${output.bytesWritten} bytes).`
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "update_diary_entry",
    {
      title: updateDiaryEntryTool.title,
      description: updateDiaryEntryTool.description,
      inputSchema: diaryUpdateInputSchema,
      outputSchema: diaryWriteResultSchema
    },
    async (input: z.infer<typeof diaryUpdateInputSchema>) => {
      const output = await client.updateDiaryEntry(input);
      return {
        content: [
          {
            type: "text",
            text: `Diary entry ${output.date} updated (${output.mode}, ${output.bytesWritten} bytes).`
          }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_okx_balance",
    {
      title: getOkxBalanceTool.title,
      description: getOkxBalanceTool.description,
      inputSchema: z.object({}),
      outputSchema: okxAccountBalanceSchema
    },
    async () => {
      const output = await client.getOkxBalance();
      const top = output.holdings.slice(0, 3).map((h) => `${h.currency}=${h.valueUsd.toFixed(0)}U`).join(" ");
      return {
        content: [{ type: "text", text: `总权益: $${output.totalEquityUsd.toFixed(2)} | ${top}` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_okx_positions",
    {
      title: getOkxPositionsTool.title,
      description: getOkxPositionsTool.description,
      inputSchema: z.object({}),
      outputSchema: okxPositionsSchema
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
    "get_okx_assets",
    {
      title: getOkxAssetsTool.title,
      description: getOkxAssetsTool.description,
      inputSchema: z.object({}),
      outputSchema: okxAssetBalancesSchema
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

  server.registerTool(
    "delete_archive_file",
    {
      title: deleteArchiveFileTool.title,
      description: deleteArchiveFileTool.description,
      inputSchema: archiveFileDeleteInputSchema,
      outputSchema: archiveFileDeleteResultSchema
    },
    async (input: z.infer<typeof archiveFileDeleteInputSchema>) => {
      const output = await client.deleteArchiveFile(input);
      return {
        content: [{ type: "text", text: output.deleted ? `Deleted ${output.path}.` : `Not found: ${output.path}.` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "search_archive",
    {
      title: searchArchiveTool.title,
      description: searchArchiveTool.description,
      inputSchema: archiveSearchInputSchema,
      outputSchema: archiveSearchResultSchema
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

  server.registerTool(
    "delete_diary_entry",
    {
      title: deleteDiaryEntryTool.title,
      description: deleteDiaryEntryTool.description,
      inputSchema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      outputSchema: diaryDeleteResultSchema
    },
    async (input: { date: string }) => {
      const output = await client.deleteDiaryEntry(input.date);
      return {
        content: [{ type: "text", text: output.deleted ? `Deleted ${output.path}.` : `Not found: ${output.path}.` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_device_timeline",
    {
      title: getDeviceTimelineTool.title,
      description: getDeviceTimelineTool.description,
      inputSchema: deviceTimelineInputSchema,
      outputSchema: deviceTimelineSchema
    },
    async (input: z.infer<typeof deviceTimelineInputSchema>) => {
      const output = await client.getDeviceTimeline(input);
      const count = output.activities?.length ?? 0;
      return {
        content: [{ type: "text", text: `Device timeline for ${output.date}: ${count} activity records.` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_health_records",
    {
      title: getHealthRecordsTool.title,
      description: getHealthRecordsTool.description,
      inputSchema: healthRecordsQueryInputSchema,
      outputSchema: healthRecordsQuerySchema
    },
    async (input: z.infer<typeof healthRecordsQueryInputSchema>) => {
      const output = await client.getHealthRecords(input);
      return {
        content: [{ type: "text", text: `${output.records.length} health records returned.` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "read_archive_file",
    {
      title: readArchiveFileTool.title,
      description: readArchiveFileTool.description,
      inputSchema: archiveFileReadInputSchema,
      outputSchema: archiveFileResultSchema
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
    "write_archive_file",
    {
      title: writeArchiveFileTool.title,
      description: writeArchiveFileTool.description,
      inputSchema: archiveFileWriteInputSchema,
      outputSchema: archiveFileWriteResultSchema
    },
    async (input: z.infer<typeof archiveFileWriteInputSchema>) => {
      const output = await client.writeArchiveFile(input);
      return {
        content: [{ type: "text", text: `${output.mode === "create" ? "Created" : "Updated"} ${output.path} (${output.size} bytes).` }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "list_archive_files",
    {
      title: listArchiveFilesTool.title,
      description: listArchiveFilesTool.description,
      inputSchema: archiveFileListInputSchema,
      outputSchema: archiveFileListResultSchema
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
    "get_current_location",
    {
      title: getCurrentLocationTool.title,
      description: getCurrentLocationTool.description,
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
            return `${d.deviceId}: ${d.lat.toFixed(5)},${d.lon.toFixed(5)}${speed} @ ${d.recordedAt}`;
          }).join("\n");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_location_history",
    {
      title: getLocationHistoryTool.title,
      description: getLocationHistoryTool.description,
      inputSchema: locationHistoryQueryInputSchema,
      outputSchema: locationHistorySchema,
      annotations: { readOnlyHint: true }
    },
    async (input: z.infer<typeof locationHistoryQueryInputSchema>) => {
      const output = await client.getLocationHistory(input);
      const summary = output.total === 0
        ? "该时段内无位置记录。"
        : `共 ${output.total} 个位置点，最新: ${output.points[0]?.recordedAt ?? "—"}`;
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    "get_weather",
    {
      title: getWeatherTool.title,
      description: getWeatherTool.description,
      inputSchema: z.object({}),
      outputSchema: weatherSchema,
      annotations: { readOnlyHint: true }
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

  server.registerTool(
    "get_steam_recent_games",
    {
      title: getSteamRecentGamesTool.title,
      description: getSteamRecentGamesTool.description,
      inputSchema: z.object({}),
      outputSchema: steamRecentGamesSchema,
      annotations: { readOnlyHint: true }
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
    "get_steam_profile",
    {
      title: getSteamProfileTool.title,
      description: getSteamProfileTool.description,
      inputSchema: z.object({}),
      outputSchema: steamPlayerSummarySchema,
      annotations: { readOnlyHint: true }
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

  const sendVoiceMessageTool = mcpToolCatalog.find((t) => t.id === "send_voice_message")!;
  server.registerTool(
    "send_voice_message",
    {
      title: sendVoiceMessageTool.title,
      description: sendVoiceMessageTool.description,
      inputSchema: z.object({
        deviceId: z.string().min(1).describe("Target device id, e.g. 'android-phone'"),
        senderName: z.string().min(1).describe("Your AI name as it should appear in the notification, e.g. 'Claude'"),
        senderAvatarUrl: z.string().url().optional().describe("Optional avatar image URL"),
        text: z.string().min(1).max(300).describe("What to say. Keep it short — one sentence works best for voice.")
      }),
      annotations: { readOnlyHint: false }
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
      case "read_profile_summary": {
        const output = await client.getProfileSummary();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.displayName} 的 profile summary。`,
          preview: output.summary,
          executedAt
        });
      }
      case "get_recent_context": {
        const output = await client.getRecentContext();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.recentDraftTitles.length} 条最近 draft 提示。`,
          preview: output.statusHints[0] ?? output.summary,
          executedAt
        });
      }
      case "create_journal_draft": {
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
      case "get_health_summary": {
        const output = await client.getHealthSummary();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "读取到最新健康摘要。",
          preview: `steps=${output.stepCount ?? "n/a"} · sleep=${output.sleepHours ?? "n/a"}`,
          executedAt
        });
      }
      case "get_connector_status": {
        const output = await client.getConnectorStatus();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `连接器在线 ${output.summary.online}/${output.summary.total}。`,
          preview: output.connectors[0]?.name ?? "No connectors returned.",
          executedAt
        });
      }
      case "get_archive_status": {
        const output = await client.getArchiveStatus();
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `Archive 状态：${output.status}。`,
          preview: output.diaryPath ?? output.lastError,
          executedAt
        });
      }
      case "list_diary_entries": {
        const output = await client.listDiaryEntries(5);
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.entries.length} 条日记索引。`,
          preview: output.entries[0]?.title ?? "Archive diary is empty.",
          executedAt
        });
      }
      case "read_diary_entry": {
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
      case "lookup_time_log_at": {
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
      case "get_device_status": {
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
      case "get_device_activity_summary": {
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
      case "get_health_metrics": {
        const output = await client.getHealthRecords({ limit: 5 });
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: `读取到 ${output.records.length} 条健康记录。`,
          preview: output.records[0]
            ? `${output.records[0].type}: ${output.records[0].value ?? JSON.stringify(output.records[0].valueJson)}`
            : "暂无健康数据。",
          executedAt
        });
      }
      case "get_device_timeline": {
        const output = await client.getDeviceTimeline({});
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `设备时间线：${output.activities?.length ?? 0} 条活动记录。`,
          preview: output.activities?.[0]?.appId ?? "暂无记录。",
          executedAt
        });
      }
      case "get_health_records": {
        const output = await client.getHealthRecords({ limit: 3 });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `健康记录：${output.records.length} 条。`,
          preview: output.records[0] ? `${output.records[0].type}: ${output.records[0].value}` : "暂无。",
          executedAt
        });
      }
      case "list_archive_files": {
        const output = await client.listArchiveFiles({});
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `Archive 顶层：${output.items.length} 个条目。`,
          preview: output.items.map((i) => i.name).join(", "),
          executedAt
        });
      }
      case "read_archive_file": {
        const output = await client.readArchiveFile({ path: "Obsidian_Asashiki/00-索引.md" });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `读取 ${output.path}，${output.size} 字节。`,
          preview: output.content.slice(0, 80),
          executedAt
        });
      }
      case "get_okx_balance": {
        const output = await client.getOkxBalance();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `OKX 账户权益 $${output.totalEquityUsd.toFixed(2)}，${output.holdings.length} 个币种持仓。`,
          preview: output.holdings[0] ? `${output.holdings[0].currency}: $${output.holdings[0].valueUsd.toFixed(2)}` : "无持仓",
          executedAt
        });
      }
      case "get_okx_positions": {
        const output = await client.getOkxPositions();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: output.positions.length === 0 ? "当前无持仓。" : `${output.positions.length} 个持仓。`,
          preview: output.positions[0]?.instrument ?? "无",
          executedAt
        });
      }
      case "get_okx_assets": {
        const output = await client.getOkxAssets();
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `资金账户 ${output.assets.length} 个资产。`,
          preview: output.assets[0] ? `${output.assets[0].currency}: ${output.assets[0].balance}` : "空",
          executedAt
        });
      }
      case "search_archive": {
        const output = await client.searchArchive({ query: "日记", limit: 3 });
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `搜索"日记"：${output.total} 条命中。`,
          preview: output.hits[0]?.excerpt ?? "暂无结果。",
          executedAt
        });
      }
      case "write_archive_file":
      case "delete_archive_file":
      case "delete_diary_entry":
        return mcpToolTestResultSchema.parse({
          toolId, ok: true,
          summary: `${toolId} smoke test 跳过（避免改动真实文件）。`,
          preview: null,
          executedAt
        });
      case "write_diary_entry":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "write_diary_entry smoke test 跳过（避免产生真实文件）。",
          preview: null,
          executedAt
        });
      case "update_diary_entry":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "update_diary_entry smoke test 跳过（避免改动真实文件）。",
          preview: null,
          executedAt
        });
      default:
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: false,
          summary: "未知 MCP 工具。",
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
