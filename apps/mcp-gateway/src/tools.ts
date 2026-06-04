import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  locationCurrentSchema,
  locationHistorySchema,
  locationHistoryQueryInputSchema,
  okxAccountBalanceSchema,
  okxAssetBalancesSchema,
  okxPositionsSchema,
  weatherSchema,
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
  healthRecordsQueryInputSchema,
  healthRecordsQuerySchema,
  healthSummarySchema,
  timeLogLookupInputSchema,
  timeLogLookupResultSchema,
  timeLogRangeInputSchema,
  timeLogRangeSchema,
  voiceBubbleInputSchema,
  voiceBubbleResultSchema,
  xSearchInputSchema,
  xSearchOutputSchema,
} from "@asashiki/schemas";
import type { CoreApiClient } from "./core-api-client.js";
import type { McpToolId } from "./mcp.js";
import { VOICE_BUBBLE_URI, VOICE_BUBBLE_MIME, VOICE_AUDIO_ORIGINS, voiceBubbleHtml } from "./ui/voice-bubble-html.js";

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

export interface RemoteToolDescriptor {
  skillId: string;
  title: string;
  description: string | null;
  serverId: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
  allowWrite: boolean;
}

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

export interface ToolContext {
  maybeTool: McpServer["registerTool"];
  isEnabled: (id: string) => boolean;
  tool: (id: McpToolId) => { title: string; description: string };
  remoteTools: RemoteToolDescriptor[];
}

/** Registers all gateway tools on the given MCP server (filtered via ctx). */
export function registerTools(server: McpServer, client: CoreApiClient, ctx: ToolContext) {
  // ───────────── profile / context / journal ─────────────

  // ───────────── connector / archive ─────────────

  ctx.maybeTool(
    "connector_status",
    {
      title: ctx.tool("connector_status").title,
      description: ctx.tool("connector_status").description,
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

  // ───────────── diary ─────────────
  // Note: diary_read/list/update/delete were removed. Agents should use
  // OpenViking search/read/forget on viking://resources/diary/ directly.
  // diary_write covers create/append/replace via the mode parameter.

  ctx.maybeTool(
    "diary_write",
    {
      title: ctx.tool("diary_write").title,
      description: ctx.tool("diary_write").description,
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

  ctx.maybeTool(
    "time_log_lookup",
    {
      title: ctx.tool("time_log_lookup").title,
      description: ctx.tool("time_log_lookup").description,
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

  ctx.maybeTool(
    "time_log_range",
    {
      title: ctx.tool("time_log_range").title,
      description: ctx.tool("time_log_range").description,
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

  ctx.maybeTool(
    "device_status",
    {
      title: ctx.tool("device_status").title,
      description: ctx.tool("device_status").description,
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

  ctx.maybeTool(
    "device_activity_summary",
    {
      title: ctx.tool("device_activity_summary").title,
      description: ctx.tool("device_activity_summary").description,
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

  ctx.maybeTool(
    "device_timeline",
    {
      title: ctx.tool("device_timeline").title,
      description: ctx.tool("device_timeline").description,
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

  ctx.maybeTool(
    "health_summary",
    {
      title: ctx.tool("health_summary").title,
      description: ctx.tool("health_summary").description,
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

  ctx.maybeTool(
    "health_records",
    {
      title: ctx.tool("health_records").title,
      description: ctx.tool("health_records").description,
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

  ctx.maybeTool(
    "location_current",
    {
      title: ctx.tool("location_current").title,
      description: ctx.tool("location_current").description,
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

  ctx.maybeTool(
    "location_history",
    {
      title: ctx.tool("location_history").title,
      description: ctx.tool("location_history").description,
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

  ctx.maybeTool(
    "weather_current",
    {
      title: ctx.tool("weather_current").title,
      description: ctx.tool("weather_current").description,
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

  ctx.maybeTool(
    "okx_balance",
    {
      title: ctx.tool("okx_balance").title,
      description: ctx.tool("okx_balance").description,
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

  ctx.maybeTool(
    "okx_positions",
    {
      title: ctx.tool("okx_positions").title,
      description: ctx.tool("okx_positions").description,
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

  ctx.maybeTool(
    "okx_assets",
    {
      title: ctx.tool("okx_assets").title,
      description: ctx.tool("okx_assets").description,
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

  ctx.maybeTool(
    "steam_recent_games",
    {
      title: ctx.tool("steam_recent_games").title,
      description: ctx.tool("steam_recent_games").description,
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

  ctx.maybeTool(
    "steam_profile",
    {
      title: ctx.tool("steam_profile").title,
      description: ctx.tool("steam_profile").description,
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
  if (ctx.isEnabled("voice_bubble")) server.registerResource(
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

  ctx.maybeTool(
    "voice_bubble",
    {
      title: ctx.tool("voice_bubble").title,
      description: ctx.tool("voice_bubble").description,
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

  ctx.maybeTool(
    "x_search",
    {
      title: ctx.tool("x_search").title,
      description: ctx.tool("x_search").description,
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
  for (const rt of ctx.remoteTools) {
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
}
