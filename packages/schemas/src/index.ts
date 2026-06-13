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

export const profileSummaryInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(1200),
  topPreferences: z.array(z.string().trim().min(1).max(80)).max(5)
});

export type ProfileSummaryInput = z.infer<typeof profileSummaryInputSchema>;

export const profileSummarySavedSchema = profileSummarySchema.extend({
  updatedAt: z.string().datetime()
});

export type ProfileSummarySaved = z.infer<typeof profileSummarySavedSchema>;

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

export const timeLogEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
  source: z.string().min(1),
  tags: z.array(z.string().min(1)).max(12),
  rawPreview: z.string().nullable()
});

export type TimeLogEvent = z.infer<typeof timeLogEventSchema>;

export const timeLogRecentSchema = z.object({
  connectorId: z.string().min(1),
  fetchedAt: z.string().datetime(),
  events: z.array(timeLogEventSchema).max(12)
});

export type TimeLogRecent = z.infer<typeof timeLogRecentSchema>;

export const timeLogLookupInputSchema = z.object({
  at: z.string().datetime()
});

export type TimeLogLookupInput = z.infer<typeof timeLogLookupInputSchema>;

export const timeLogLookupResultSchema = z.object({
  connectorId: z.string().min(1),
  queriedAt: z.string().datetime(),
  matched: z.boolean(),
  strategy: z.enum(["contains", "nearest-previous", "not-found"]),
  message: z.string().min(1),
  event: timeLogEventSchema.nullable(),
  distanceMinutes: z.number().int().nonnegative().nullable()
});

export type TimeLogLookupResult = z.infer<typeof timeLogLookupResultSchema>;

export const timeLogRangeInputSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

export type TimeLogRangeInput = z.infer<typeof timeLogRangeInputSchema>;

export const timeLogRangeSchema = z.object({
  connectorId: z.string().min(1),
  queriedFrom: z.string().datetime(),
  queriedTo: z.string().datetime(),
  fetchedAt: z.string().datetime(),
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  events: z.array(timeLogEventSchema)
});

export type TimeLogRange = z.infer<typeof timeLogRangeSchema>;

export const archiveStatusSchema = z.object({
  rootPath: z.string().min(1),
  diaryPath: z.string().min(1).nullable(),
  status: z.enum(["online", "degraded", "offline"]),
  fileCount: z.number().int().nonnegative(),
  latestDiaryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lastError: z.string().nullable(),
  checkedAt: z.string().datetime()
});

export type ArchiveStatus = z.infer<typeof archiveStatusSchema>;

export const archiveDiaryEntryPreviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  path: z.string().min(1),
  excerpt: z.string().nullable(),
  updatedAt: z.string().datetime().nullable()
});

export type ArchiveDiaryEntryPreview = z.infer<
  typeof archiveDiaryEntryPreviewSchema
>;

export const archiveDiaryListSchema = z.object({
  rootPath: z.string().min(1),
  diaryPath: z.string().min(1).nullable(),
  fetchedAt: z.string().datetime(),
  entries: z.array(archiveDiaryEntryPreviewSchema).max(100)
});

export type ArchiveDiaryList = z.infer<typeof archiveDiaryListSchema>;

export const archiveDiaryReadInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export type ArchiveDiaryReadInput = z.infer<typeof archiveDiaryReadInputSchema>;

export const archiveDiaryEntrySchema = archiveDiaryEntryPreviewSchema.extend({
  content: z.string().min(1)
});

export type ArchiveDiaryEntry = z.infer<typeof archiveDiaryEntrySchema>;

// none: 开放直连；bearer/bearer-env: 静态 token；oauth: 授权码流程（DCR 或预注册客户端）
export const remoteMcpAuthModeSchema = z.enum(["none", "bearer", "bearer-env", "oauth"]);

export type RemoteMcpAuthMode = z.infer<typeof remoteMcpAuthModeSchema>;

export const remoteMcpToolSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  readOnlyHint: z.boolean(),
  requiredArguments: z.array(z.string().min(1)).max(24),
  inputSchema: z.record(z.string(), z.unknown())
});

export type RemoteMcpTool = z.infer<typeof remoteMcpToolSchema>;

export const remoteMcpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().min(1),
  authMode: remoteMcpAuthModeSchema,
  status: z.enum(["online", "degraded", "offline"]),
  /** 服务器回了 401/需要 OAuth 授权（前端据此显示「去授权」按钮）。 */
  needsAuth: z.boolean().optional(),
  /** OAuth 服务器是否已持有 token。 */
  oauthAuthorized: z.boolean().optional(),
  lastSeenAt: z.string().datetime(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  toolCount: z.number().int().nonnegative(),
  readOnlyToolCount: z.number().int().nonnegative(),
  writeToolCount: z.number().int().nonnegative(),
  tools: z.array(remoteMcpToolSchema).max(32)
});

export type RemoteMcpServer = z.infer<typeof remoteMcpServerSchema>;

export const remoteMcpToolInvokeInputSchema = z.object({
  arguments: z.record(z.string(), z.unknown()).default({}),
  allowWrite: z.boolean().default(false)
});

export type RemoteMcpToolInvokeInput = z.infer<
  typeof remoteMcpToolInvokeInputSchema
>;

export const remoteMcpToolInvokeResultSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  ok: z.boolean(),
  summary: z.string().min(1),
  preview: z.string().nullable(),
  executedAt: z.string().datetime()
});

export type RemoteMcpToolInvokeResult = z.infer<
  typeof remoteMcpToolInvokeResultSchema
>;

export const mcpToolCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  readOnlyHint: z.boolean()
});

export const mcpToolCatalogSchema = z.array(mcpToolCatalogItemSchema).max(64);

export type McpToolCatalogItem = z.infer<typeof mcpToolCatalogItemSchema>;

export const mcpToolTestResultSchema = z.object({
  toolId: z.string().min(1),
  ok: z.boolean(),
  summary: z.string().min(1),
  preview: z.string().nullable(),
  executedAt: z.string().datetime()
});

export type McpToolTestResult = z.infer<typeof mcpToolTestResultSchema>;

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

export const deviceReportInputSchema = z.object({
  appId: z.string().trim().min(1).max(120),
  windowTitle: z.string().trim().max(256).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  extra: z.record(z.string(), z.unknown()).optional()
});

export type DeviceReportInput = z.infer<typeof deviceReportInputSchema>;

export const deviceStateSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.string().min(1),
  appId: z.string().nullable(),
  windowTitle: z.string().nullable(),
  lastSeenAt: z.string().datetime(),
  isOnline: z.boolean(),
  extra: z.record(z.string(), z.unknown()).nullable()
});

export type DeviceState = z.infer<typeof deviceStateSchema>;

export const deviceCurrentSchema = z.object({
  fetchedAt: z.string().datetime(),
  devices: z.array(deviceStateSchema)
});

export type DeviceCurrent = z.infer<typeof deviceCurrentSchema>;

export const deviceActivitySchema = z.object({
  id: z.number().int().nonnegative(),
  deviceId: z.string().min(1),
  appId: z.string().min(1),
  windowTitle: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  extra: z.record(z.string(), z.unknown()).nullable()
});

export type DeviceActivity = z.infer<typeof deviceActivitySchema>;

export const deviceTimelineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fetchedAt: z.string().datetime(),
  activities: z.array(deviceActivitySchema)
});

export type DeviceTimeline = z.infer<typeof deviceTimelineSchema>;

export const deviceActivitySummaryEntrySchema = z.object({
  appId: z.string().min(1),
  windowTitle: z.string().nullable(),
  totalSeconds: z.number().int().nonnegative(),
  count: z.number().int().nonnegative()
});

export const deviceActivitySummarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fetchedAt: z.string().datetime(),
  perApp: z.array(deviceActivitySummaryEntrySchema).max(50),
  totalSeconds: z.number().int().nonnegative()
});

export type DeviceActivitySummary = z.infer<typeof deviceActivitySummarySchema>;

export const healthRecordTypeSchema = z.enum([
  "heart_rate",
  "resting_heart_rate",
  "heart_rate_variability",
  "steps",
  "distance",
  "exercise",
  "sleep",
  "oxygen_saturation",
  "body_temperature",
  "respiratory_rate",
  "blood_pressure",
  "blood_glucose",
  "weight",
  "height",
  "active_calories",
  "total_calories",
  "hydration",
  "nutrition"
]);

export type HealthRecordType = z.infer<typeof healthRecordTypeSchema>;

export const healthRecordInputSchema = z.object({
  type: healthRecordTypeSchema,
  value: z.number().optional(),
  valueJson: z.record(z.string(), z.unknown()).optional(),
  unit: z.string().min(1).max(32).optional(),
  recordedAt: z.string().datetime(),
  source: z.string().min(1).max(60).optional()
});

export type HealthRecordInput = z.infer<typeof healthRecordInputSchema>;

export const healthRecordsBatchInputSchema = z.object({
  records: z.array(healthRecordInputSchema).min(1).max(500)
});

export type HealthRecordsBatchInput = z.infer<typeof healthRecordsBatchInputSchema>;

export const healthRecordSchema = z.object({
  id: z.number().int().nonnegative(),
  deviceId: z.string().min(1),
  type: healthRecordTypeSchema,
  value: z.number().nullable(),
  valueJson: z.record(z.string(), z.unknown()).nullable(),
  unit: z.string().nullable(),
  recordedAt: z.string().datetime(),
  source: z.string().nullable(),
  createdAt: z.string().datetime()
});

export type HealthRecord = z.infer<typeof healthRecordSchema>;

export const healthRecordsQueryInputSchema = z.object({
  type: healthRecordTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  deviceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

export type HealthRecordsQueryInput = z.infer<typeof healthRecordsQueryInputSchema>;

export const healthRecordsQuerySchema = z.object({
  fetchedAt: z.string().datetime(),
  records: z.array(healthRecordSchema)
});

export type HealthRecordsQuery = z.infer<typeof healthRecordsQuerySchema>;

export const diaryWriteInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Diary date, YYYY-MM-DD."),
  content: z
    .string()
    .min(1)
    .max(64 * 1024)
    .describe("Markdown content of the diary entry."),
  mode: z
    .enum(["create", "append", "replace"])
    .default("create")
    .describe("create=new entry (fails if exists); append=add to existing; replace=overwrite existing.")
});

export type DiaryWriteInput = z.infer<typeof diaryWriteInputSchema>;

export const diaryWriteResultSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  uri: z.string(),
  bytesWritten: z.number().int().nonnegative(),
  mode: z.enum(["create", "append", "replace"]),
  semanticStatus: z.string().optional(),
  vectorStatus: z.string().optional()
});

export type DiaryWriteResult = z.infer<typeof diaryWriteResultSchema>;

// ─────────────────────────────────────────────────────────────────────────

export const diaryDeleteResultSchema = z.object({
  date: z.string(),
  deleted: z.boolean(),
  path: z.string()
});

export type DiaryDeleteResult = z.infer<typeof diaryDeleteResultSchema>;

export const archiveFileDeleteInputSchema = z.object({
  path: z.string().min(1).max(500)
});

export type ArchiveFileDeleteInput = z.infer<typeof archiveFileDeleteInputSchema>;

export const archiveFileDeleteResultSchema = z.object({
  path: z.string(),
  deleted: z.boolean()
});

export type ArchiveFileDeleteResult = z.infer<typeof archiveFileDeleteResultSchema>;

export const archiveSearchInputSchema = z.object({
  query: z.string().min(1).max(200),
  dir: z.string().max(500).optional(),
  limit: z.coerce.number().int().positive().max(50).optional()
});

export type ArchiveSearchInput = z.infer<typeof archiveSearchInputSchema>;

export const archiveSearchHitSchema = z.object({
  path: z.string(),
  excerpt: z.string(),
  modifiedAt: z.string()
});

export const archiveSearchResultSchema = z.object({
  query: z.string(),
  total: z.number(),
  hits: z.array(archiveSearchHitSchema)
});

export type ArchiveSearchResult = z.infer<typeof archiveSearchResultSchema>;

export const archiveFileReadInputSchema = z.object({
  path: z.string().min(1).max(500)
});

export type ArchiveFileReadInput = z.infer<typeof archiveFileReadInputSchema>;

export const archiveFileResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  size: z.number(),
  modifiedAt: z.string()
});

export type ArchiveFileResult = z.infer<typeof archiveFileResultSchema>;

export const archiveFileWriteInputSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(256 * 1024),
  overwrite: z.boolean().optional()
});

export type ArchiveFileWriteInput = z.infer<typeof archiveFileWriteInputSchema>;

export const archiveFileWriteResultSchema = z.object({
  path: z.string(),
  size: z.number(),
  savedAt: z.string(),
  mode: z.enum(["create", "replace"])
});

export type ArchiveFileWriteResult = z.infer<typeof archiveFileWriteResultSchema>;

export const archiveFileListInputSchema = z.object({
  dir: z.string().max(500).optional()
});

export type ArchiveFileListInput = z.infer<typeof archiveFileListInputSchema>;

export const archiveFileListItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  isDir: z.boolean(),
  size: z.number().optional(),
  modifiedAt: z.string().optional()
});

export const archiveFileListResultSchema = z.object({
  dir: z.string(),
  items: z.array(archiveFileListItemSchema)
});

export type ArchiveFileListResult = z.infer<typeof archiveFileListResultSchema>;

export const deviceTimelineInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deviceId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
});

export type DeviceTimelineInput = z.infer<typeof deviceTimelineInputSchema>;

// ─── Location ────────────────────────────────────────────────────────────────

export const locationPointInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  altitudeM: z.number().optional(),
  speedMps: z.number().nonnegative().optional(),
  bearingDeg: z.number().optional(),
  activity: z.enum(["still", "on_foot", "running", "in_vehicle", "unknown"]).optional(),
  recordedAt: z.string()
});

export const locationBatchInputSchema = z.object({
  points: z.array(locationPointInputSchema).min(1).max(200)
});

export type LocationBatchInput = z.infer<typeof locationBatchInputSchema>;

export const locationPointSchema = z.object({
  id: z.number().int(),
  deviceId: z.string(),
  lat: z.number(),
  lon: z.number(),
  accuracyM: z.number().nullable(),
  altitudeM: z.number().nullable(),
  speedMps: z.number().nullable(),
  bearingDeg: z.number().nullable(),
  activity: z.string().nullable(),
  recordedAt: z.string(),
  createdAt: z.string()
});

export type LocationPoint = z.infer<typeof locationPointSchema>;

export const locationDeviceLastSchema = z.object({
  deviceId: z.string(),
  lat: z.number(),
  lon: z.number(),
  accuracyM: z.number().nullable(),
  speedMps: z.number().nullable(),
  activity: z.string().nullable(),
  recordedAt: z.string()
});

export const locationCurrentSchema = z.object({
  fetchedAt: z.string(),
  devices: z.array(locationDeviceLastSchema)
});

export type LocationCurrent = z.infer<typeof locationCurrentSchema>;

export const locationHistoryQueryInputSchema = z.object({
  deviceId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

export type LocationHistoryQueryInput = z.infer<typeof locationHistoryQueryInputSchema>;

export const locationHistorySchema = z.object({
  fetchedAt: z.string(),
  total: z.number().int(),
  points: z.array(locationPointSchema)
});

export type LocationHistory = z.infer<typeof locationHistorySchema>;

// ─── Weather ──────────────────────────────────────────────────────────────────

export const weatherCurrentSchema = z.object({
  time: z.string(),
  temperatureC: z.number(),
  feelsLikeC: z.number(),
  humidity: z.number(),
  windSpeedKmh: z.number(),
  precipitationMm: z.number(),
  weatherCode: z.number().int(),
  description: z.string()
});

export const weatherForecastDaySchema = z.object({
  date: z.string(),
  maxC: z.number(),
  minC: z.number(),
  precipitationMm: z.number(),
  maxWindKmh: z.number(),
  weatherCode: z.number().int(),
  description: z.string()
});

export const weatherSchema = z.object({
  fetchedAt: z.string(),
  location: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  current: weatherCurrentSchema,
  forecast: z.array(weatherForecastDaySchema)
});

export type Weather = z.infer<typeof weatherSchema>;

// ─── Steam ────────────────────────────────────────────────────────────────────

export const steamRecentGameSchema = z.object({
  appId: z.number().int(),
  name: z.string(),
  playtime2WeeksMinutes: z.number().int(),
  playtimeForeverMinutes: z.number().int(),
  iconUrl: z.string().nullable()
});

export const steamRecentGamesSchema = z.object({
  fetchedAt: z.string(),
  steamId: z.string(),
  totalCount: z.number().int(),
  games: z.array(steamRecentGameSchema)
});

export type SteamRecentGames = z.infer<typeof steamRecentGamesSchema>;

export const steamPlayerSummarySchema = z.object({
  fetchedAt: z.string(),
  steamId: z.string(),
  displayName: z.string(),
  profileUrl: z.string(),
  avatarUrl: z.string(),
  status: z.string(),
  currentGame: z.string().nullable(),
  currentGameId: z.number().int().nullable(),
  country: z.string().nullable(),
  lastLogoffAt: z.string().nullable()
});

export type SteamPlayerSummary = z.infer<typeof steamPlayerSummarySchema>;

// ─── Voice messages (AI → device push) ───────────────────────────────────────
export const voiceMessageInputSchema = z.object({
  deviceId: z.string().min(1).max(60),
  senderName: z.string().min(1).max(60),
  senderAvatarUrl: z.string().url().optional(),
  text: z.string().min(1).max(5000)
});
export type VoiceMessageInput = z.infer<typeof voiceMessageInputSchema>;

export const voiceMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  deviceId: z.string(),
  senderName: z.string(),
  senderAvatarUrl: z.string().nullable(),
  text: z.string(),
  audioUrl: z.string(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string(),
  deliveredAt: z.string().nullable(),
  playedAt: z.string().nullable()
});
export type VoiceMessage = z.infer<typeof voiceMessageSchema>;

export const voiceMessagesPendingSchema = z.object({
  fetchedAt: z.string(),
  messages: z.array(voiceMessageSchema)
});
export type VoiceMessagesPending = z.infer<typeof voiceMessagesPendingSchema>;

// ─── X (Twitter) search via Hermes / xAI on LA VPS ───────────────────────────

const xHandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform((s) => s.replace(/^@+/, ""));

export const xSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("Search query, e.g. 'claude code', '@asashiki_', 'AI agents'."),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Max results, 1-20. Default 10."),
    allowedHandles: z
      .array(xHandleSchema)
      .max(10)
      .optional()
      .describe("Only return posts from these handles (no @). Max 10. Mutually exclusive with excludedHandles."),
    excludedHandles: z
      .array(xHandleSchema)
      .max(10)
      .optional()
      .describe("Exclude posts from these handles. Max 10. Do not combine with allowedHandles."),
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Filter: posts on/after this date (YYYY-MM-DD)."),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Filter: posts on/before this date (YYYY-MM-DD)."),
    enableImageUnderstanding: z
      .boolean()
      .optional()
      .describe("Have the model analyze attached images. Default false; costs more and slower."),
    enableVideoUnderstanding: z
      .boolean()
      .optional()
      .describe("Have the model analyze attached videos. Default false; costs more and slower.")
  })
  .refine(
    (v) => !(v.allowedHandles?.length && v.excludedHandles?.length),
    { message: "Do not pass allowedHandles and excludedHandles together." }
  );

export type XSearchInput = z.infer<typeof xSearchInputSchema>;

export const xSearchOutputSchema = z
  .object({
    success: z.boolean(),
    query: z.string(),
    results: z.array(z.unknown()).default([]),
    meta: z.record(z.unknown()).optional(),
    service: z.string().optional(),
    error: z.string().optional()
  })
  .passthrough();

export type XSearchOutput = z.infer<typeof xSearchOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────

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
