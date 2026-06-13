import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, type RemoteToolDescriptor, type RemoteResourceDescriptor } from "./tools.js";
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
  "steam_recent_games",
  "steam_profile",
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

// Skill registry metadata: just the initial enabled state. The only axis the
// gateway can reliably know is local vs remote (set by `source` at seed time),
// so `category` is a flat "local" for built-ins — auto function-categorization
// was removed (it was guesswork). Use-scenario grouping is the user-edited
// skill groups, kept separate.
export const skillMeta: Record<McpToolId, { initialEnabled: boolean }> = {
  connector_status: { initialEnabled: true },
  diary_write: { initialEnabled: true },
  time_log_lookup: { initialEnabled: true },
  time_log_range: { initialEnabled: true },
  device_status: { initialEnabled: true },
  device_activity_summary: { initialEnabled: true },
  device_timeline: { initialEnabled: true },
  health_summary: { initialEnabled: true },
  health_records: { initialEnabled: true },
  location_current: { initialEnabled: true },
  location_history: { initialEnabled: true },
  weather_current: { initialEnabled: true },
  steam_recent_games: { initialEnabled: false },
  steam_profile: { initialEnabled: false },
  x_search: { initialEnabled: true }
};

// Builds an MCP server instance per request. Tool registrations live in
// tools.ts; this wires the registry filter (maybeTool) + remote tools in.
export function createMcpGatewayServer(
  client: CoreApiClient,
  opts?: {
    enabledSkills?: Set<string>;
    remoteTools?: RemoteToolDescriptor[];
    /** UI resources exposed by remote servers (MCP Apps widgets), for passthrough. */
    remoteResources?: RemoteResourceDescriptor[];
    /** Reads a remote server's resource by uri (forwarded via core-api). */
    readRemoteResource?: (serverId: string, uri: string) => Promise<{ contents: Array<{ uri: string; mimeType?: string | null; text?: string | null; blob?: string | null; meta?: unknown }> }>;
    /** Per-tool-call audit hook (toolName, success, latencyMs). */
    onToolCall?: (toolName: string, success: boolean, latencyMs: number) => void;
    /**
     * skillId → console group name. MCP has no native grouping, so the group
     * is surfaced as a title prefix (「组名」Title) in tools/list — clients
     * (claude.ai / ChatGPT / Grok) pick it up on their next refresh.
     */
    groupNames?: Map<string, string>;
  }
) {
  const enabledSkills = opts?.enabledSkills;
  // No registry passed (dev/test) → expose everything. Otherwise filter.
  const isEnabled = (id: McpToolId | string) => !enabledSkills || enabledSkills.has(id);

  const groupNames = opts?.groupNames;
  const groupedTool = (id: McpToolId) => {
    const entry = tool(id);
    const group = groupNames?.get(id);
    return group ? { ...entry, title: `「${group}」${entry.title}` } : entry;
  };
  const remoteTools = (opts?.remoteTools ?? []).map((rt) => {
    const group = groupNames?.get(rt.skillId);
    return group ? { ...rt, title: `「${group}」${rt.title}` } : rt;
  });

  // MCP clients (claude.ai / ChatGPT / Grok) bucket tools by annotation in their
  // permission UI — they can't render our custom groups there. So we surface the
  // operator's console grouping in the server `instructions` instead: the model
  // reads this on connect and knows which tools belong to which group, even though
  // the permission list shows them flat. (Title also carries a「group」prefix.)
  const buildInstructions = (): string => {
    type Entry = { id: string; title: string; group: string };
    const entries: Entry[] = [];
    for (const t of mcpToolCatalog) {
      if (!isEnabled(t.id)) continue;
      entries.push({ id: t.id, title: t.title, group: groupNames?.get(t.id) ?? "未分组" });
    }
    for (const rt of opts?.remoteTools ?? []) {
      entries.push({ id: rt.skillId, title: rt.title, group: groupNames?.get(rt.skillId) ?? "未分组" });
    }
    const byGroup = new Map<string, Entry[]>();
    for (const e of entries) {
      const arr = byGroup.get(e.group) ?? [];
      arr.push(e);
      byGroup.set(e.group, arr);
    }
    // Named groups first (operator intent), "未分组" last.
    const groupOrder = [...byGroup.keys()].sort((a, b) =>
      a === "未分组" ? 1 : b === "未分组" ? -1 : a.localeCompare(b, "zh"));
    const lines = groupOrder.map((g) => {
      const tools = byGroup.get(g)!.map((e) => `${e.id} (${e.title})`).join("、");
      return `【${g}】${tools}`;
    });
    return [
      "Asashiki MCP —— a personal capability hub (device/health/location/time-log/weather/diary/web-search, plus any connected remote tools).",
      "Read safe summaries from the Core API and create journal drafts through the backend write path; remote tools are proxied as-is.",
      "",
      "The operator has organized the available tools into the following groups. Use these groupings to choose the right tool for a request:",
      ...lines
    ].join("\n");
  };

  const server = new McpServer(
    {
      name: "asashiki-mcp-gateway",
      version: "0.1.0"
    },
    {
      instructions: buildInstructions()
    }
  );

  // Audit every tool invocation (local + remote) by wrapping registerTool's
  // callback. MCP handled-errors surface as result.isError, not throws.
  const onToolCall = opts?.onToolCall;
  const origRegister = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  const auditedRegister = ((name: string, cfg: unknown, cb: (...a: unknown[]) => unknown) => {
    const wrapped = onToolCall
      ? async (...args: unknown[]) => {
          const started = Date.now();
          try {
            const result = await cb(...args);
            const isError = !!(result && typeof result === "object" && (result as { isError?: boolean }).isError);
            onToolCall(name, !isError, Date.now() - started);
            return result;
          } catch (e) {
            onToolCall(name, false, Date.now() - started);
            throw e;
          }
        }
      : cb;
    return origRegister(name, cfg, wrapped);
  }) as typeof server.registerTool;
  (server as { registerTool: typeof server.registerTool }).registerTool = auditedRegister;

  // Only register tools that are enabled in the registry (filtered tools/list).
  const maybeTool: typeof server.registerTool = ((id: McpToolId, cfg: unknown, cb: unknown) => {
    if (!isEnabled(id)) return undefined as never;
    return (server.registerTool as unknown as (...a: unknown[]) => unknown)(id, cfg, cb) as never;
  }) as typeof server.registerTool;

  registerTools(server, client, {
    maybeTool, isEnabled, tool: groupedTool, remoteTools,
    remoteResources: opts?.remoteResources ?? [],
    readRemoteResource: opts?.readRemoteResource
  });

  return server;
}

