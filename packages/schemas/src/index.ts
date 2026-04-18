import { z } from "zod";

export const schemaVersion = "2026-04-m2";

export const serviceKindSchema = z.enum([
  "public-web",
  "admin-web",
  "core-api",
  "mcp-gateway"
]);

export type ServiceKind = z.infer<typeof serviceKindSchema>;

export const exposureLevelSchema = z.enum([
  "public",
  "private-operational",
  "private-personal",
  "mcp-exposed"
]);

export const serviceManifestSchema = z.object({
  id: serviceKindSchema,
  name: z.string().min(1),
  port: z.number().int().positive(),
  exposure: exposureLevelSchema,
  description: z.string().min(1)
});

export type ServiceManifest = z.infer<typeof serviceManifestSchema>;

export const serviceHealthSchema = z.object({
  app: serviceManifestSchema,
  schemaVersion: z.literal(schemaVersion),
  environment: z.enum(["development", "test", "production"]),
  startedAt: z.string().datetime(),
  status: z.enum(["ok"]),
  uptimeSeconds: z.number().nonnegative()
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const publicStatusCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  value: z.string().min(1),
  visibility: z.literal("public")
});

export const publicStatusSchema = z.object({
  status: z.enum(["online", "degraded", "offline"]),
  message: z.string().min(1),
  updatedAt: z.string().datetime(),
  cards: z.array(publicStatusCardSchema).max(4)
});

export type PublicStatus = z.infer<typeof publicStatusSchema>;

export const publicStatusWidgetThemeSchema = z.enum([
  "linen-signal",
  "graphite-signal"
]);

export type PublicStatusWidgetTheme = z.infer<
  typeof publicStatusWidgetThemeSchema
>;

export const publicStatusWidgetConfigSchema = z.object({
  component: z.literal("public-status-widget"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  statusEndpoint: z.string().min(1),
  cardsEndpoint: z.string().min(1),
  pollingIntervalMs: z.number().int().positive(),
  maxCards: z.number().int().positive().max(4),
  theme: publicStatusWidgetThemeSchema,
  emptyMessage: z.string().min(1),
  docsLabel: z.string().min(1)
});

export type PublicStatusWidgetConfig = z.infer<
  typeof publicStatusWidgetConfigSchema
>;

export const profileSummarySchema = z.object({
  displayName: z.string().min(1),
  summary: z.string().min(1),
  topPreferences: z.array(z.string().min(1)).max(5)
});

export type ProfileSummary = z.infer<typeof profileSummarySchema>;

export const journalDraftSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  source: z.string().min(1),
  occurredAt: z.string().datetime().nullable(),
  status: z.literal("draft"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type JournalDraft = z.infer<typeof journalDraftSchema>;

export const journalEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).max(8),
  createdAt: z.string().datetime()
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const journalCollectionSchema = z.object({
  drafts: z.array(journalDraftSchema),
  entries: z.array(journalEntrySchema)
});

export type JournalCollection = z.infer<typeof journalCollectionSchema>;

export const recentContextSchema = z.object({
  summary: z.string().min(1),
  recentDraftTitles: z.array(z.string().min(1)).max(3),
  recentEntryTitles: z.array(z.string().min(1)).max(3),
  statusHints: z.array(z.string().min(1)).max(5),
  generatedAt: z.string().datetime()
});

export type RecentContext = z.infer<typeof recentContextSchema>;

export const connectorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  status: z.enum(["online", "degraded", "offline"]),
  lastSeenAt: z.string().datetime(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  capabilities: z.array(z.string().min(1)).max(12),
  exposureLevel: exposureLevelSchema
});

export type Connector = z.infer<typeof connectorSchema>;

export const connectorSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  online: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  offline: z.number().int().nonnegative()
});

export type ConnectorSummary = z.infer<typeof connectorSummarySchema>;

export const healthSummarySchema = z.object({
  restingHeartRate: z.number().int().positive().nullable(),
  sleepHours: z.number().positive().nullable(),
  stepCount: z.number().int().nonnegative().nullable(),
  capturedAt: z.string().datetime()
});

export type HealthSummary = z.infer<typeof healthSummarySchema>;

export const healthSnapshotSchema = z.object({
  id: z.string().uuid(),
  capturedAt: z.string().datetime(),
  restingHeartRate: z.number().int().positive().nullable(),
  sleepHours: z.number().positive().nullable(),
  stepCount: z.number().int().nonnegative().nullable(),
  note: z.string().nullable()
});

export type HealthSnapshot = z.infer<typeof healthSnapshotSchema>;

export const journalDraftInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(5000),
  source: z.string().trim().min(1).max(60).default("mcp"),
  occurredAt: z.string().datetime().optional()
});

export const journalDraftSavedSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  source: z.string().min(1),
  createdAt: z.string().datetime()
});

export type JournalDraftSaved = z.infer<typeof journalDraftSavedSchema>;

export const auditMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  actor: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  metadata: auditMetadataSchema,
  createdAt: z.string().datetime()
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export function createServiceHealth(
  app: ServiceManifest,
  environment: "development" | "test" | "production",
  startedAt: Date,
  now = new Date()
): ServiceHealth {
  return serviceHealthSchema.parse({
    app,
    schemaVersion,
    environment,
    startedAt: startedAt.toISOString(),
    status: "ok",
    uptimeSeconds: Math.max(
      0,
      Math.round((now.getTime() - startedAt.getTime()) / 1000)
    )
  });
}
