import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, type RemoteToolDescriptor } from "./tools.js";
import { mcpToolCatalogSchema } from "@asashiki/schemas";
import { z } from "zod";
import type { CoreApiClient } from "./core-api-client.js";

// Tool ID convention: <domain>_<action>.
// Domain groups related capabilities so model selection is easier; action is the verb.
// See apps/mcp-gateway/README.md for how to add a new tool.
const mcpToolIds = [
  "connector_status",
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
    id: "connector_status",
    title: "Connector Status",
    description: "Connector summary and per-connector state.",
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
  connector_status: { category: skillCategory.meta, initialEnabled: true },
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

// Builds an MCP server instance per request. Tool registrations live in
// tools.ts; this wires the registry filter (maybeTool) + remote tools in.
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

  registerTools(server, client, { maybeTool, isEnabled, tool, remoteTools: opts?.remoteTools ?? [] });

  return server;
}

