import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  connectorSchema,
  connectorSummarySchema,
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
  "lookup_time_log_at"
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
    id: "lookup_time_log_at",
    title: "Lookup Time Log At",
    description:
      "Look up the Supabase-backed time log around a specific timestamp through the Core API.",
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
const lookupTimeLogTool = mcpToolCatalog.find(
  (tool) => tool.id === "lookup_time_log_at"
)!;

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
