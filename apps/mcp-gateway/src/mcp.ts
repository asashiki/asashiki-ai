import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  locationCurrentSchema,
  locationHistorySchema,
  locationHistoryQueryInputSchema,
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
  timeLogRangeSchema,
  voiceBubbleInputSchema,
  voiceBubbleResultSchema,
  xSearchInputSchema,
  xSearchOutputSchema
} from "@asashiki/schemas";
import { z } from "zod";
import type { CoreApiClient } from "./core-api-client.js";
import { VOICE_BUBBLE_URI, VOICE_BUBBLE_MIME, VOICE_AUDIO_ORIGINS, voiceBubbleHtml } from "./ui/voice-bubble-html.js";

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
  "diary_write",
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
  "voice_bubble",
  "x_search"
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
    id: "diary_write",
    title: "Write Diary Entry",
    description: "Write/append/replace a diary entry into OpenViking diary/.",
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
    id: "voice_bubble",
    title: "Voice Message",
    description: "Reply with a playable Anna-voice message bubble in the chat.",
    readOnlyHint: false
  },
  {
    id: "x_search",
    title: "X / Twitter Search",
    description: "Search posts/profiles on X via Hermes+xAI. Slow (~30s).",
    readOnlyHint: true
  }
]);

function tool(id: McpToolId) {
  const entry = mcpToolCatalog.find((t) => t.id === id);
  if (!entry) throw new Error(`Missing catalog entry: ${id}`);
  return entry;
}

// Skill registry metadata: use-scenario category + initial enabled state.
// Seeded into the gateway's skill_registry on startup; the console can later
// flip `enabled`. `source` is 'local' for all current tools (remote-mcp
// proxied tools will register here with source='remote-mcp' in a later phase).
export const skillCategory = {
  realtime: "realtime",   // 实时状态感知
  action: "action",       // 动作/执行
  search: "search",       // 检索（x_search + 未来社交检索）
  finance: "finance",     // 资金/理财
  profile: "profile",     // 个人画像
  personal: "personal",   // 个人数据（迁 viking）
  archive: "archive",     // 资料（退役，交给 OpenViking）
  meta: "meta"            // 运维/元信息
} as const;

export const skillMeta: Record<McpToolId, { category: string; initialEnabled: boolean }> = {
  profile_read_summary: { category: skillCategory.profile, initialEnabled: false },
  context_recent: { category: skillCategory.profile, initialEnabled: false },
  journal_create_draft: { category: skillCategory.action, initialEnabled: false },
  connector_status: { category: skillCategory.meta, initialEnabled: true },
  archive_status: { category: skillCategory.archive, initialEnabled: false },
  archive_list: { category: skillCategory.archive, initialEnabled: false },
  archive_read: { category: skillCategory.archive, initialEnabled: false },
  archive_write: { category: skillCategory.archive, initialEnabled: false },
  archive_delete: { category: skillCategory.archive, initialEnabled: false },
  archive_search: { category: skillCategory.archive, initialEnabled: false },
  diary_write: { category: skillCategory.action, initialEnabled: true },
  time_log_lookup: { category: skillCategory.realtime, initialEnabled: true },
  time_log_range: { category: skillCategory.realtime, initialEnabled: true },
  device_status: { category: skillCategory.realtime, initialEnabled: true },
  device_activity_summary: { category: skillCategory.realtime, initialEnabled: true },
  device_timeline: { category: skillCategory.realtime, initialEnabled: true },
  health_summary: { category: skillCategory.realtime, initialEnabled: true },
  health_records: { category: skillCategory.realtime, initialEnabled: true },
  location_current: { category: skillCategory.realtime, initialEnabled: true },
  location_history: { category: skillCategory.realtime, initialEnabled: true },
  weather_current: { category: skillCategory.realtime, initialEnabled: true },
  okx_balance: { category: skillCategory.finance, initialEnabled: false },
  okx_positions: { category: skillCategory.finance, initialEnabled: false },
  okx_assets: { category: skillCategory.finance, initialEnabled: false },
  steam_recent_games: { category: skillCategory.personal, initialEnabled: false },
  steam_profile: { category: skillCategory.personal, initialEnabled: false },
  voice_bubble: { category: skillCategory.action, initialEnabled: true },
  x_search: { category: skillCategory.search, initialEnabled: true }
};

export interface RemoteToolDescriptor {
  skillId: string;
  title: string;
  description: string | null;
  serverId: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
  allowWrite: boolean;
}

// Shallow JSON-Schema → Zod raw shape: top-level properties become z.unknown()
// (optional unless required), preserving param names/descriptions for tools/list.
// Deep/typed conversion is a future refinement; values pass through to the remote.
function jsonSchemaToRawShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = (schema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(schema?.required) ? (schema.required as string[]) : [];
  for (const [key, prop] of Object.entries(props)) {
    let t: z.ZodTypeAny = z.unknown();
    const desc = prop && typeof prop.description === "string" ? prop.description : undefined;
    if (desc) t = t.describe(desc);
    if (!required.includes(key)) t = t.optional();
    shape[key] = t;
  }
  return shape;
}

export function createMcpGatewayServer(
  client: CoreApiClient,
  opts?: { enabledSkills?: Set<string>; remoteTools?: RemoteToolDescriptor[] }
) {
  const enabledSkills = opts?.enabledSkills;
  // No registry passed (dev/test) → expose everything. Otherwise filter.
  const isEnabled = (id: McpToolId | string) => !enabledSkills || enabledSkills.has(id);

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

  // Only register tools that are enabled in the registry (filtered tools/list).
  const maybeTool: typeof server.registerTool = ((id: McpToolId, cfg: unknown, cb: unknown) => {
    if (!isEnabled(id)) return undefined as never;
    return (server.registerTool as unknown as (...a: unknown[]) => unknown)(id, cfg, cb) as never;
  }) as typeof server.registerTool;

  // ───────────── profile / context / journal ─────────────

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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
  // Note: diary_read/list/update/delete were removed. Agents should use
  // OpenViking search/read/forget on viking://resources/diary/ directly.
  // diary_write covers create/append/replace via the mode parameter.

  maybeTool(
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
        openWorldHint: true
      }
    },
    async (input: z.infer<typeof diaryWriteInputSchema>) => {
      const output = await client.writeDiaryEntry(input);
      return {
        content: [
          { type: "text", text: `Diary ${output.date} ${output.mode} → ${output.uri} (${output.bytesWritten} bytes).` }
        ],
        structuredContent: output
      };
    }
  );

  // ───────────── time log / device / health ─────────────

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  maybeTool(
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

  // ───────────── voice (in-chat bubble via MCP Apps) ─────────────
  // Note: the old voice_send (push TTS to the Android app) is intentionally
  // no longer exposed to AI clients. Its core-api route + device polling stay
  // intact for the app; only the MCP tool was removed. See README.

  // UI resource: the voice bubble widget (rendered by claude.ai / ChatGPT).
  // The sandboxed iframe gets a strict CSP by default; declare the audio origin
  // so the <audio> element can load the mp3. Two CSP namespaces are emitted:
  //   - `ui.csp.{resourceDomains,connectDomains}`     — MCP Apps standard (Claude)
  //   - `openai/widgetCSP.{resource_domains,connect_domains}` — ChatGPT alias (snake_case)
  // Claude reads the first; ChatGPT only reads the second.
  const voiceCsp = {
    ui: {
      csp: {
        resourceDomains: VOICE_AUDIO_ORIGINS,
        connectDomains: VOICE_AUDIO_ORIGINS
      }
    },
    "openai/widgetCSP": {
      resource_domains: VOICE_AUDIO_ORIGINS,
      connect_domains: VOICE_AUDIO_ORIGINS
    }
  };
  if (isEnabled("voice_bubble")) server.registerResource(
    "voice-bubble",
    VOICE_BUBBLE_URI,
    {
      title: "Voice Bubble",
      description: "Telegram-style playable voice message widget.",
      mimeType: VOICE_BUBBLE_MIME,
      _meta: voiceCsp
    },
    async () => ({
      contents: [
        {
          uri: VOICE_BUBBLE_URI,
          mimeType: VOICE_BUBBLE_MIME,
          text: voiceBubbleHtml(),
          _meta: voiceCsp
        }
      ]
    })
  );

  maybeTool(
    "voice_bubble",
    {
      title: tool("voice_bubble").title,
      description: tool("voice_bubble").description,
      inputSchema: voiceBubbleInputSchema,
      outputSchema: voiceBubbleResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      },
      // Link this tool to the UI resource for both MCP Apps (Claude) and ChatGPT.
      _meta: {
        ui: { resourceUri: VOICE_BUBBLE_URI },
        "openai/outputTemplate": VOICE_BUBBLE_URI
      }
    },
    async (input: z.infer<typeof voiceBubbleInputSchema>) => {
      const output = await client.createVoiceBubble(input);
      return {
        content: [
          { type: "text", text: `🎤 ${output.senderName}: ${output.text}` }
        ],
        structuredContent: output,
        _meta: { ui: { resourceUri: VOICE_BUBBLE_URI } }
      };
    }
  );

  // ───────────── x (twitter) ─────────────

  maybeTool(
    "x_search",
    {
      title: tool("x_search").title,
      description: tool("x_search").description,
      inputSchema: xSearchInputSchema,
      outputSchema: xSearchOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (input: z.infer<typeof xSearchInputSchema>) => {
      const output = await client.searchX(input);
      const hits = Array.isArray(output.results) ? output.results : [];
      const head = hits.slice(0, 5).map((r, i) => {
        const rec = (r ?? {}) as Record<string, unknown>;
        const type = typeof rec.type === "string" ? rec.type : "post";
        const account = typeof rec.account === "string"
          ? rec.account
          : typeof rec.author_handle === "string"
            ? `@${(rec.author_handle as string).replace(/^@+/, "")}`
            : "?";
        const text = typeof rec.text === "string"
          ? rec.text
          : typeof rec.bio === "string"
            ? rec.bio
            : JSON.stringify(rec).slice(0, 200);
        return `${i + 1}. [${type}] ${account}: ${text.slice(0, 200)}`;
      }).join("\n");
      const summary = hits.length === 0
        ? `No results for "${output.query}".${output.error ? ` (${output.error})` : ""}`
        : `${hits.length} result(s) for "${output.query}":\n${head}`;
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: output
      };
    }
  );

  // ───────────── remote-mcp proxied tools (source='remote-mcp') ─────────────
  // Pre-filtered by the caller to the agent's visible+enabled set. Each forwards
  // to core-api's full-result proxy. Read-only only in v1 (allowWrite=false).
  for (const rt of opts?.remoteTools ?? []) {
    server.registerTool(
      rt.skillId,
      {
        title: rt.title,
        description: rt.description ?? `Remote tool ${rt.toolName} (via ${rt.serverId}).`,
        inputSchema: jsonSchemaToRawShape(rt.inputSchema),
        annotations: { openWorldHint: true }
      },
      async (args: Record<string, unknown>) => {
        try {
          const r = await client.proxyRemoteMcpTool(rt.serverId, rt.toolName, args ?? {}, rt.allowWrite);
          const content = Array.isArray(r.content) && r.content.length
            ? r.content
            : [{ type: "text", text: typeof r.structuredContent !== "undefined" ? JSON.stringify(r.structuredContent) : "(no content)" }];
          return { content: content as { type: "text"; text: string }[], structuredContent: r.structuredContent as Record<string, unknown> | undefined, isError: r.isError };
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Remote tool failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
        }
      }
    );
  }

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
          summary: "diary_write smoke test 跳过（避免污染 viking 日记目录）。",
          preview: null,
          executedAt
        });
      case "x_search":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "x_search smoke test 跳过（避免烧 xAI 配额，每次调用 ~30s）。",
          preview: null,
          executedAt
        });
      case "voice_bubble":
        return mcpToolTestResultSchema.parse({
          toolId,
          ok: true,
          summary: "voice_bubble smoke test 跳过（避免烧 MiniMax TTS 配额）。",
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
