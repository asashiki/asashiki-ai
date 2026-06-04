import type { CoreApiClient } from "./core-api-client.js";
import type { McpToolId } from "./mcp.js";
import { mcpToolTestResultSchema } from "@asashiki/schemas";

// Per-tool smoke tests, invoked from the admin /tools/:id/test endpoint.
export async function runMcpToolSmokeTest(
  client: CoreApiClient,
  toolId: McpToolId
) {
  const executedAt = new Date().toISOString();

  try {
    switch (toolId) {
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
