import Fastify from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServiceHealth, serviceManifestSchema } from "@asashiki/schemas";
import { parseServiceEnv } from "@asashiki/config";
import { z } from "zod";
import { createCoreApiClient } from "./core-api-client.js";
import { createMcpGatewayServer } from "./mcp.js";

export const mcpGatewayEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4200),
  MCP_CORE_API_BASE_URL: z.string().url().default("http://127.0.0.1:4100")
});

export type McpGatewayEnv = z.infer<typeof mcpGatewayEnvSchema>;

export function loadMcpGatewayEnv(source: NodeJS.ProcessEnv): McpGatewayEnv {
  const normalizedSource: NodeJS.ProcessEnv = {
    ...source,
    HOST: source.MCP_GATEWAY_HOST ?? source.HOST,
    PORT: source.MCP_GATEWAY_PORT ?? source.PORT,
    MCP_CORE_API_BASE_URL:
      source.MCP_CORE_API_BASE_URL ?? "http://127.0.0.1:4100"
  };

  return mcpGatewayEnvSchema.parse(
    parseServiceEnv("mcp-gateway", normalizedSource, {
      PORT: z.coerce.number().int().positive().default(4200),
      MCP_CORE_API_BASE_URL: z.string().url().default("http://127.0.0.1:4100")
    })
  );
}

export async function createMcpGatewayApp(options?: {
  env?: McpGatewayEnv;
  logger?: boolean;
  startedAt?: Date;
}) {
  const env = options?.env ?? loadMcpGatewayEnv(process.env);
  const startedAt = options?.startedAt ?? new Date();
  const client = createCoreApiClient(env.MCP_CORE_API_BASE_URL);

  const manifest = serviceManifestSchema.parse({
    id: "mcp-gateway",
    name: "MCP Gateway",
    port: env.PORT,
    exposure: "mcp-exposed",
    description: "Thin tool facade over the Core API"
  });

  const server = Fastify({
    logger: options?.logger ?? true
  });

  server.get("/health", async () =>
    createServiceHealth(manifest, env.NODE_ENV, startedAt)
  );

  server.get("/tools", async () => ({
    upstream: env.MCP_CORE_API_BASE_URL,
    tools: [
      "read_profile_summary",
      "get_recent_context",
      "create_journal_draft",
      "get_health_summary",
      "get_connector_status"
    ]
  }));

  server.post("/mcp", async (request, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    const mcpServer = createMcpGatewayServer(client);

    reply.raw.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    return reply;
  });

  return {
    env,
    server
  };
}
