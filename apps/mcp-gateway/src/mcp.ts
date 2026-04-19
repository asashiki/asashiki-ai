import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  connectorSchema,
  connectorSummarySchema,
  healthSummarySchema,
  journalDraftInputSchema,
  journalDraftSavedSchema,
  profileSummarySchema,
  recentContextSchema
} from "@asashiki/schemas";
import { z } from "zod";
import type { CoreApiClient } from "./core-api-client.js";

const connectorStatusOutputSchema = z.object({
  summary: connectorSummarySchema,
  connectors: connectorSchema.array()
});

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
      title: "Read Profile Summary",
      description: "Read the stable profile summary curated by the Core API.",
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
      title: "Get Recent Context",
      description:
        "Return a compact context summary assembled from recent journals and safe status hints.",
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
      title: "Create Journal Draft",
      description:
        "Create a journal draft through the Core API so storage and audit stay backend-governed.",
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
      title: "Get Health Summary",
      description:
        "Read the latest safe health summary without exposing raw personal history.",
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
      title: "Get Connector Status",
      description:
        "Return connector summary plus current connector states curated by the Core API.",
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

  return server;
}
