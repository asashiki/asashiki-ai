import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  connectorSchema,
  remoteMcpServerSchema,
  remoteMcpToolInvokeInputSchema,
  remoteMcpToolInvokeResultSchema,
  remoteMcpToolSchema
} from "@asashiki/schemas";
import type {
  Connector,
  RemoteMcpServer,
  RemoteMcpTool,
  RemoteMcpToolInvokeResult
} from "@asashiki/schemas";
import { z } from "zod";

const remoteMcpServerConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().url(),
  description: z.string().trim().min(1),
  bearerTokenEnv: z.string().trim().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true)
});

type RemoteMcpServerConfig = z.infer<typeof remoteMcpServerConfigSchema>;

type RemoteMcpServerSnapshot = {
  summary: RemoteMcpServer;
  expiresAt: number;
};

function summarizeTool(tool: Record<string, unknown>, serverId: string) {
  const inputSchema =
    typeof tool.inputSchema === "object" && tool.inputSchema !== null
      ? (tool.inputSchema as Record<string, unknown>)
      : {};
  const requiredArguments = Array.isArray(inputSchema.required)
    ? inputSchema.required.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];

  return remoteMcpToolSchema.parse({
    serverId,
    name: typeof tool.name === "string" ? tool.name : "unknown-tool",
    title: typeof tool.title === "string" ? tool.title : null,
    description: typeof tool.description === "string" ? tool.description : null,
    readOnlyHint:
      typeof tool.annotations === "object" &&
      tool.annotations !== null &&
      typeof (tool.annotations as { readOnlyHint?: unknown }).readOnlyHint ===
        "boolean"
        ? Boolean((tool.annotations as { readOnlyHint?: boolean }).readOnlyHint)
        : false,
    requiredArguments,
    inputSchema
  });
}

function buildPreview(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 400);
  }

  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2).slice(0, 400);
  } catch {
    return String(value).slice(0, 400);
  }
}

function buildRequestHeaders(
  config: RemoteMcpServerConfig,
  envSource: NodeJS.ProcessEnv
) {
  const headers: Record<string, string> = {
    ...(config.headers ?? {})
  };

  if (config.bearerTokenEnv) {
    const token = envSource[config.bearerTokenEnv];

    if (!token) {
      throw new Error(`Missing bearer token env: ${config.bearerTokenEnv}`);
    }

    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function withRemoteClient<T>(
  config: RemoteMcpServerConfig,
  envSource: NodeJS.ProcessEnv,
  callback: (client: Client) => Promise<T>
) {
  const client = new Client({
    name: "asashiki-core-api-remote-mcp",
    version: "0.1.0"
  });

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: buildRequestHeaders(config, envSource)
    }
  });

  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

export function parseRemoteMcpServerConfigs(source?: string) {
  if (!source || source.trim().length === 0) {
    return [] satisfies RemoteMcpServerConfig[];
  }

  const parsed = JSON.parse(source) as unknown;
  return z.array(remoteMcpServerConfigSchema).parse(parsed).filter((item) => item.enabled);
}

export function createRemoteMcpRegistry(options: {
  servers: RemoteMcpServerConfig[];
  envSource: NodeJS.ProcessEnv;
  cacheTtlMs?: number;
}) {
  const cacheTtlMs = options.cacheTtlMs ?? 2 * 60 * 1000;
  const cache = new Map<string, RemoteMcpServerSnapshot>();

  async function loadServerSummary(
    config: RemoteMcpServerConfig,
    force = false
  ) {
    const current = cache.get(config.id);

    if (!force && current && current.expiresAt > Date.now()) {
      return current.summary;
    }

    const seenAt = new Date().toISOString();

    try {
      const listed = await withRemoteClient(config, options.envSource, async (client) =>
        client.listTools()
      );

      const tools = listed.tools.map((tool: Record<string, unknown>) =>
        summarizeTool(tool as Record<string, unknown>, config.id)
      );
      const summary = remoteMcpServerSchema.parse({
        id: config.id,
        name: config.name,
        url: config.url,
        description: config.description,
        authMode: config.bearerTokenEnv ? "bearer-env" : "none",
        status: "online",
        lastSeenAt: seenAt,
        lastSuccessAt: seenAt,
        lastError: null,
        toolCount: tools.length,
        readOnlyToolCount: tools.filter((tool: RemoteMcpTool) => tool.readOnlyHint)
          .length,
        writeToolCount: tools.filter((tool: RemoteMcpTool) => !tool.readOnlyHint)
          .length,
        tools
      });

      cache.set(config.id, {
        summary,
        expiresAt: Date.now() + cacheTtlMs
      });

      return summary;
    } catch (error) {
      const previous = current?.summary ?? null;
      const summary = remoteMcpServerSchema.parse({
        id: config.id,
        name: config.name,
        url: config.url,
        description: config.description,
        authMode: config.bearerTokenEnv ? "bearer-env" : "none",
        status: "offline",
        lastSeenAt: seenAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastError:
          error instanceof Error
            ? error.message
            : "Failed to connect to remote MCP server.",
        toolCount: previous?.toolCount ?? 0,
        readOnlyToolCount: previous?.readOnlyToolCount ?? 0,
        writeToolCount: previous?.writeToolCount ?? 0,
        tools: previous?.tools ?? []
      });

      cache.set(config.id, {
        summary,
        expiresAt: Date.now() + cacheTtlMs
      });

      return summary;
    }
  }

  function resolveServer(serverId: string) {
    const config = options.servers.find((item) => item.id === serverId);

    if (!config) {
      throw new Error(`Unknown remote MCP server: ${serverId}`);
    }

    return config;
  }

  async function listServers(force = false) {
    return Promise.all(options.servers.map((server) => loadServerSummary(server, force)));
  }

  async function listTools(serverId: string, force = false) {
    const config = resolveServer(serverId);
    const summary = await loadServerSummary(config, force);
    return summary.tools;
  }

  return {
    listServers,
    listTools,

    async invokeTool(
      serverId: string,
      toolName: string,
      input: unknown
    ): Promise<RemoteMcpToolInvokeResult> {
      const payload = remoteMcpToolInvokeInputSchema.parse(input);
      const config = resolveServer(serverId);
      const tools = await listTools(serverId, true);
      const tool = tools.find((item: RemoteMcpTool) => item.name === toolName);

      if (!tool) {
        throw new Error(`Remote MCP tool not found: ${toolName}`);
      }

      if (!tool.readOnlyHint && !payload.allowWrite) {
        throw new Error(
          `Tool ${toolName} is not marked read-only. Set allowWrite=true only if you explicitly want to run it.`
        );
      }

      const executedAt = new Date().toISOString();

      try {
        const result = await withRemoteClient(
          config,
          options.envSource,
          async (client) =>
            client.callTool({
              name: toolName,
              arguments: payload.arguments
            })
        );

        const contentText =
          "content" in result && Array.isArray(result.content)
            ? result.content
                .map((item: { type?: unknown; text?: unknown } | null) =>
                  item && typeof item === "object" && item.type === "text"
                    ? String(item.text)
                    : null
                )
                .filter((item): item is string => item !== null)
                .join("\n")
            : null;
        const preview = buildPreview(
          "structuredContent" in result && result.structuredContent
            ? result.structuredContent
            : contentText
        );

        return remoteMcpToolInvokeResultSchema.parse({
          serverId,
          toolName,
          ok: !("isError" in result && Boolean(result.isError)),
          summary:
            "isError" in result && result.isError
              ? `Remote MCP tool ${toolName} returned an error.`
              : `Remote MCP tool ${toolName} executed successfully.`,
          preview,
          executedAt
        });
      } catch (error) {
        return remoteMcpToolInvokeResultSchema.parse({
          serverId,
          toolName,
          ok: false,
          summary:
            error instanceof Error
              ? error.message
              : `Remote MCP tool ${toolName} failed.`,
          preview: null,
          executedAt
        });
      }
    },

    async toConnectors(force = false): Promise<Connector[]> {
      const servers = await listServers(force);
      return servers.map((server) =>
        connectorSchema.parse({
          id: `remote-mcp-${server.id}`,
          name: server.name,
          kind: "remote-mcp",
          status: server.status,
          lastSeenAt: server.lastSeenAt,
          lastSuccessAt: server.lastSuccessAt,
          lastError: server.lastError,
          capabilities: [
            "remote-mcp",
            `tool-count:${server.toolCount}`,
            ...server.tools.slice(0, 4).map((tool) => `tool:${tool.name}`)
          ].slice(0, 12),
          exposureLevel: "private-operational"
        })
      );
    }
  };
}

export type RemoteMcpRegistry = ReturnType<typeof createRemoteMcpRegistry>;
