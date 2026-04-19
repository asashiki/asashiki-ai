import Fastify from "fastify";
import cors from "@fastify/cors";
import { parseServiceEnv } from "@asashiki/config";
import { createServiceHealth, serviceManifestSchema } from "@asashiki/schemas";
import { z } from "zod";
import { apiRuntimeSchema } from "./contracts.js";
import { initializeDatabase, resolveDatabasePath } from "./db.js";
import { createRepository } from "./repository.js";

export const coreApiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4100),
  CORE_API_DB_PATH: z.string().min(1).default("./data/core-api.sqlite")
});

export type CoreApiEnv = z.infer<typeof coreApiEnvSchema>;

export function loadCoreApiEnv(source: NodeJS.ProcessEnv): CoreApiEnv {
  const normalizedSource: NodeJS.ProcessEnv = {
    ...source,
    HOST: source.CORE_API_HOST ?? source.HOST,
    PORT: source.CORE_API_PORT ?? source.PORT,
    CORE_API_DB_PATH: source.CORE_API_DB_PATH ?? "./data/core-api.sqlite"
  };

  return coreApiEnvSchema.parse(
    parseServiceEnv("core-api", normalizedSource, {
      PORT: z.coerce.number().int().positive().default(4100),
      CORE_API_DB_PATH: z.string().min(1).default("./data/core-api.sqlite")
    })
  );
}

export async function createCoreApiApp(options?: {
  env?: CoreApiEnv;
  seed?: boolean;
  logger?: boolean;
  startedAt?: Date;
}) {
  const env = options?.env ?? loadCoreApiEnv(process.env);
  const startedAt = options?.startedAt ?? new Date();
  const databasePath = resolveDatabasePath(env.CORE_API_DB_PATH);
  const database = initializeDatabase(databasePath, { seed: options?.seed });
  const repository = createRepository(database);

  const manifest = serviceManifestSchema.parse({
    id: "core-api",
    name: "Core API",
    port: env.PORT,
    exposure: "private-operational",
    description: "Personal AI Control Plane business core"
  });

  const server = Fastify({ logger: options?.logger ?? true });

  await server.register(cors, {
    origin: true
  });

  server.addHook("onClose", async () => {
    database.close();
  });

  server.get("/health", async () =>
    createServiceHealth(manifest, env.NODE_ENV, startedAt)
  );

  server.get("/api/runtime", async () =>
    apiRuntimeSchema.parse({
      milestone: "Milestone 2",
      databasePath,
      sharedPackages: ["@asashiki/config", "@asashiki/schemas"]
    })
  );

  server.get("/api/profile/summary", async () => repository.getProfileSummary());
  server.put("/api/profile/summary", async (request) =>
    repository.updateProfileSummary(request.body)
  );
  server.get("/api/context/recent", async () => repository.getRecentContext());
  server.get("/api/journals", async () => repository.listJournals());
  server.post("/api/journals/drafts", async (request, reply) => {
    const draft = repository.createJournalDraft(request.body);
    reply.code(201);
    return draft;
  });

  server.get("/api/journals/drafts/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const draft = repository.getJournalDraft(params.id);

    if (!draft) {
      reply.code(404);
      return {
        message: "Journal draft not found."
      };
    }

    return draft;
  });

  server.get("/api/health/summary", async () => repository.getHealthSummary());
  server.get("/api/health/latest", async () => repository.getLatestHealthSnapshot());
  server.get("/api/connectors", async () => repository.listConnectors());
  server.get("/api/connectors/summary", async () => repository.getConnectorSummary());
  server.get("/api/audit/recent", async () => repository.listRecentAudit());
  server.get("/public/cards", async () => repository.getPublicCards());
  server.get("/public/status", async () => repository.getPublicStatus());
  server.get("/public/widget-config", async () => repository.getPublicWidgetConfig());

  return {
    env,
    databasePath,
    repository,
    server
  };
}
