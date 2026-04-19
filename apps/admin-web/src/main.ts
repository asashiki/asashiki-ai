import {
  auditEventSchema,
  connectorSchema,
  connectorSummarySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftSavedSchema,
  mcpToolCatalogSchema,
  mcpToolTestResultSchema,
  profileSummaryInputSchema,
  profileSummarySavedSchema,
  profileSummarySchema,
  serviceHealthSchema,
  timeLogLookupResultSchema,
  timeLogRecentSchema
} from "@asashiki/schemas";
import type {
  AuditEvent,
  Connector,
  ConnectorSummary,
  HealthSnapshot,
  HealthSummary,
  JournalCollection,
  McpToolCatalogItem,
  McpToolTestResult,
  ProfileSummary,
  ServiceHealth,
  TimeLogLookupResult,
  TimeLogRecent
} from "@asashiki/schemas";
import "./style.css";

type ViewId =
  | "overview"
  | "profile"
  | "journals"
  | "connectors"
  | "tools"
  | "activity";

type Resource<T> =
  | {
      status: "ready";
      data: T;
    }
  | {
      status: "error";
      message: string;
    };

type DashboardResources = {
  coreHealth: Resource<ServiceHealth>;
  mcpHealth: Resource<ServiceHealth>;
  profile: Resource<ProfileSummary>;
  journals: Resource<JournalCollection>;
  healthSummary: Resource<HealthSummary>;
  latestHealth: Resource<HealthSnapshot>;
  connectors: Resource<Connector[]>;
  connectorSummary: Resource<ConnectorSummary>;
  timeLogRecent: Resource<TimeLogRecent>;
  recentAudit: Resource<AuditEvent[]>;
  toolCatalog: Resource<McpToolCatalogItem[]>;
};

type ProfileFormState = {
  displayName: string;
  summary: string;
  topPreferencesText: string;
  dirty: boolean;
};

type JournalFormState = {
  title: string;
  source: string;
  content: string;
};

type FlashState =
  | {
      tone: "success" | "error" | "info";
      text: string;
    }
  | null;

type AppState = {
  activeView: ViewId;
  resources: DashboardResources | null;
  loading: boolean;
  flash: FlashState;
  lastRefreshedAt: string | null;
  savingProfile: boolean;
  savingJournal: boolean;
  profileForm: ProfileFormState;
  journalForm: JournalFormState;
  toolRuns: Record<
    string,
    {
      pending: boolean;
      result: McpToolTestResult | null;
    }
  >;
  timeLogQueryAt: string;
  timeLogLookup: {
    pending: boolean;
    result: TimeLogLookupResult | null;
    error: string | null;
  };
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const root = app;
const coreApiBaseUrl =
  import.meta.env.VITE_CORE_API_BASE_URL ?? "http://127.0.0.1:4100";
const mcpGatewayBaseUrl =
  import.meta.env.VITE_MCP_GATEWAY_BASE_URL ?? "http://127.0.0.1:4200";

const state: AppState = {
  activeView: getActiveView(),
  resources: null,
  loading: true,
  flash: null,
  lastRefreshedAt: null,
  savingProfile: false,
  savingJournal: false,
  profileForm: {
    displayName: "",
    summary: "",
    topPreferencesText: "",
    dirty: false
  },
  journalForm: {
    title: "",
    source: "admin-dashboard",
    content: ""
  },
  toolRuns: {},
  timeLogQueryAt: toLocalDatetimeValue(new Date()),
  timeLogLookup: {
    pending: false,
    result: null,
    error: null
  }
};

const viewMeta: Record<
  ViewId,
  {
    label: string;
    eyebrow: string;
    description: string;
  }
> = {
  overview: {
    label: "总览",
    eyebrow: "首页",
    description: "先看系统是否在线、数据是否完整，以及今天最需要注意的地方。"
  },
  profile: {
    label: "档案",
    eyebrow: "可编辑核心",
    description: "维护给你和 agent 共用的基础摘要、偏好和说明。"
  },
  journals: {
    label: "记录",
    eyebrow: "写入入口",
    description: "随手记想法、经历、待办和上下文，所有写入都通过 Core API。"
  },
  connectors: {
    label: "连接中心",
    eyebrow: "连接登记",
    description: "这里看的是系统登记的连接器状态，不是外部 agent 的在线列表。"
  },
  tools: {
    label: "工具测试",
    eyebrow: "MCP 网关",
    description: "这里展示的是 mcp-gateway 暴露的工具，并可逐个做冒烟测试。"
  },
  activity: {
    label: "系统状态",
    eyebrow: "运行与审计",
    description: "集中查看服务运行、审计日志和缺失数据，排查问题时再进来。"
  }
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "暂缺";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "未同步";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} 小时前`;
  }

  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function formatNumber(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) {
    return "暂缺";
  }

  return `${value}${suffix}`;
}

function toLocalDatetimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatConnectorStatus(status: Connector["status"]) {
  switch (status) {
    case "online":
      return "在线";
    case "degraded":
      return "降级";
    case "offline":
      return "离线";
    default:
      return status;
  }
}

function formatExposureLevel(exposureLevel: string) {
  switch (exposureLevel) {
    case "private-personal":
      return "私密个人";
    case "private-operational":
      return "私密运行";
    case "public-safe":
      return "公开安全";
    default:
      return exposureLevel;
  }
}

function formatToolTitle(tool: McpToolCatalogItem) {
  switch (tool.id) {
    case "read_profile_summary":
      return "读取档案摘要";
    case "get_recent_context":
      return "读取最近上下文";
    case "create_journal_draft":
      return "创建记录草稿";
    case "get_health_summary":
      return "读取健康摘要";
    case "get_connector_status":
      return "读取连接状态";
    case "lookup_time_log_at":
      return "按时刻查询时间日志";
    default:
      return tool.title;
  }
}

function formatToolDescription(tool: McpToolCatalogItem) {
  switch (tool.id) {
    case "read_profile_summary":
      return "读取当前保存的个人档案摘要，确认 agent 能拿到基础背景。";
    case "get_recent_context":
      return "读取最近草稿和状态提示，确认上下文摘要链路可用。";
    case "create_journal_draft":
      return "通过网关创建一条记录草稿，验证写入链路是否正常。";
    case "get_health_summary":
      return "读取当前健康摘要，不暴露原始明细。";
    case "get_connector_status":
      return "读取连接器摘要和当前状态，确认外部连接面是否可读。";
    case "lookup_time_log_at":
      return "按某个时刻查询 Supabase 时间日志，回答“那时我在做什么”。";
    default:
      return tool.description;
  }
}

function formatResourceName(key: string) {
  const names: Record<string, string> = {
    coreHealth: "Core API 健康状态",
    mcpHealth: "MCP Gateway 健康状态",
    profile: "档案摘要",
    journals: "记录数据",
    healthSummary: "健康摘要",
    latestHealth: "最新健康快照",
    connectors: "连接器列表",
    connectorSummary: "连接摘要",
    timeLogRecent: "Supabase 时间日志预览",
    recentAudit: "最近审计事件",
    toolCatalog: "MCP 工具目录"
  };

  return names[key] ?? key;
}

function serializePreferences(topPreferences: string[]) {
  return topPreferences.join("\n");
}

function parsePreferences(text: string) {
  return Array.from(
    new Set(
      text
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 5);
}

function getActiveView(): ViewId {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const views: ViewId[] = [
    "overview",
    "profile",
    "journals",
    "connectors",
    "tools",
    "activity"
  ];

  return views.includes(hash as ViewId) ? (hash as ViewId) : "overview";
}

function isReady<T>(resource: Resource<T>): resource is { status: "ready"; data: T } {
  return resource.status === "ready";
}

function isResourceReady(resource: Resource<unknown>) {
  return resource.status === "ready";
}

function asData<T>(resource: Resource<T> | null | undefined) {
  return resource && isReady(resource) ? resource.data : null;
}

function getResourceError<T>(resource: Resource<T>) {
  return resource.status === "error" ? resource.message : "当前数据可用。";
}

function createErrorMessage(label: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : `${label} 加载失败。`;
  return `${label}：${message}`;
}

async function loadHealth(url: string, label: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label} 响应 ${response.status}`);
  }

  return serviceHealthSchema.parse(await response.json());
}

async function loadJson<T>(
  url: string,
  parser: { parse: (value: unknown) => T },
  label: string
) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label} 响应 ${response.status}`);
  }

  return parser.parse(await response.json());
}

async function loadResource<T>(
  label: string,
  loader: () => Promise<T>
): Promise<Resource<T>> {
  try {
    return {
      status: "ready",
      data: await loader()
    };
  } catch (error) {
    return {
      status: "error",
      message: createErrorMessage(label, error)
    };
  }
}

async function loadDashboardResources(): Promise<DashboardResources> {
  const [
    coreHealth,
    mcpHealth,
    profile,
    journals,
    healthSummary,
    latestHealth,
    connectors,
    connectorSummary,
    timeLogRecent,
    recentAudit,
    toolCatalog
  ] = await Promise.all([
    loadResource("Core API 健康状态", () =>
      loadHealth(`${coreApiBaseUrl}/health`, "Core API 健康状态")
    ),
    loadResource("MCP Gateway 健康状态", () =>
      loadHealth(`${mcpGatewayBaseUrl}/health`, "MCP Gateway 健康状态")
    ),
    loadResource("档案摘要", () =>
      loadJson(
        `${coreApiBaseUrl}/api/profile/summary`,
        profileSummarySchema,
        "档案摘要"
      )
    ),
    loadResource("记录数据", () =>
      loadJson(
        `${coreApiBaseUrl}/api/journals`,
        journalCollectionSchema,
        "记录数据"
      )
    ),
    loadResource("健康摘要", () =>
      loadJson(
        `${coreApiBaseUrl}/api/health/summary`,
        healthSummarySchema,
        "健康摘要"
      )
    ),
    loadResource("最新健康快照", () =>
      loadJson(
        `${coreApiBaseUrl}/api/health/latest`,
        healthSnapshotSchema,
        "最新健康快照"
      )
    ),
    loadResource("连接器列表", () =>
      loadJson(
        `${coreApiBaseUrl}/api/connectors`,
        connectorSchema.array(),
        "连接器列表"
      )
    ),
    loadResource("连接摘要", () =>
      loadJson(
        `${coreApiBaseUrl}/api/connectors/summary`,
        connectorSummarySchema,
        "连接摘要"
      )
    ),
    loadResource("Supabase 时间日志预览", () =>
      loadJson(
        `${coreApiBaseUrl}/api/time-log/recent?limit=5`,
        timeLogRecentSchema,
        "Supabase 时间日志预览"
      )
    ),
    loadResource("最近审计事件", () =>
      loadJson(
        `${coreApiBaseUrl}/api/audit/recent`,
        auditEventSchema.array(),
        "最近审计事件"
      )
    ),
    loadResource("MCP 工具目录", () =>
      loadJson(
        `${mcpGatewayBaseUrl}/tools/catalog`,
        {
          parse(value: unknown) {
            const payload = value as { tools?: unknown };
            return mcpToolCatalogSchema.parse(payload.tools ?? []);
          }
        },
        "MCP 工具目录"
      )
    )
  ]);

  return {
    coreHealth,
    mcpHealth,
    profile,
    journals,
    healthSummary,
    latestHealth,
    connectors,
    connectorSummary,
    timeLogRecent,
    recentAudit,
    toolCatalog
  };
}

function syncProfileForm(resources: DashboardResources, force = false) {
  const profile = asData(resources.profile);

  if (!profile) {
    return;
  }

  if (!force && state.profileForm.dirty) {
    return;
  }

  state.profileForm = {
    displayName: profile.displayName,
    summary: profile.summary,
    topPreferencesText: serializePreferences(profile.topPreferences),
    dirty: false
  };
}

function renderNav() {
  return (Object.entries(viewMeta) as Array<[ViewId, (typeof viewMeta)[ViewId]]>)
    .map(
      ([viewId, meta]) => `
        <a class="nav-link ${state.activeView === viewId ? "is-active" : ""}" href="#/${viewId}">
          <span class="nav-link__eyebrow">${meta.eyebrow}</span>
          <strong>${meta.label}</strong>
          <small>${meta.description}</small>
        </a>
      `
    )
    .join("");
}

function renderBadge(
  label: string,
  tone: "good" | "warn" | "bad" | "neutral" = "neutral"
) {
  return `<span class="badge badge--${tone}">${escapeHtml(label)}</span>`;
}

function renderResourceBanner(title: string, message: string, compact = false) {
  return `
    <section class="fallback-card ${compact ? "fallback-card--compact" : ""}">
      <div class="fallback-card__header">
        <p>当前不可用</p>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderMetricCard(
  label: string,
  value: string,
  meta: string,
  tone: "neutral" | "good" | "warn" = "neutral"
) {
  return `
    <article class="metric-card metric-card--${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(meta)}</p>
    </article>
  `;
}

function renderTimeLogLookupResult(result: TimeLogLookupResult) {
  if (!result.matched || !result.event) {
    return `
      <div class="inline-alert">
        <strong>没有匹配到记录</strong>
        <span>${escapeHtml(result.message)}</span>
      </div>
    `;
  }

  return `
    <div class="inline-alert inline-alert--success">
      <strong>${escapeHtml(result.event.title)}</strong>
      <span>${escapeHtml(result.message)}</span>
      <small>
        ${escapeHtml(formatDateTime(result.event.startedAt))}
        ${
          result.event.endedAt
            ? ` → ${escapeHtml(formatDateTime(result.event.endedAt))}`
            : ""
        }
        ${
          result.distanceMinutes !== null && result.distanceMinutes > 0
            ? ` · 提前 ${result.distanceMinutes} 分钟`
            : ""
        }
      </small>
      ${
        result.event.note || result.event.rawPreview
          ? `<span>${escapeHtml(result.event.note ?? result.event.rawPreview ?? "")}</span>`
          : ""
      }
    </div>
  `;
}

function renderEmptyState(title: string, description: string) {
  return `
    <section class="empty-state">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </section>
  `;
}

function renderLoadingShell() {
  return `
    <section class="loading-shell">
      <article class="skeleton-card skeleton-card--hero"></article>
      <div class="skeleton-grid">
        <article class="skeleton-card"></article>
        <article class="skeleton-card"></article>
        <article class="skeleton-card"></article>
      </div>
      <div class="skeleton-grid skeleton-grid--wide">
        <article class="skeleton-card"></article>
        <article class="skeleton-card"></article>
      </div>
    </section>
  `;
}

function renderTopStatus(resources: DashboardResources | null) {
  if (!resources) {
    return `
      <section class="status-strip">
        ${renderBadge("等待首次同步", "warn")}
        ${renderBadge("Core API 未知", "neutral")}
        ${renderBadge("MCP Gateway 未知", "neutral")}
      </section>
    `;
  }

  const readyCount = Object.values(resources).filter((resource) =>
    isResourceReady(resource)
  ).length;
  const totalCount = Object.keys(resources).length;
  const coreHealth = asData(resources.coreHealth);
  const mcpHealth = asData(resources.mcpHealth);
  const journals = asData(resources.journals);
  const connectorSummary = asData(resources.connectorSummary);
  const timeLogRecent = asData(resources.timeLogRecent);
  const toolCatalog = asData(resources.toolCatalog);

  return `
    <section class="status-strip">
      ${renderBadge(
        coreHealth ? `Core API ${coreHealth.status}` : "Core API 不可用",
        coreHealth ? "good" : "bad"
      )}
      ${renderBadge(
        mcpHealth ? `MCP ${mcpHealth.status}` : "MCP Gateway 不可用",
        mcpHealth ? "good" : "bad"
      )}
      ${renderBadge(`数据流 ${readyCount}/${totalCount}`, readyCount === totalCount ? "good" : "warn")}
      ${renderBadge(
        journals ? `草稿 ${journals.drafts.length}` : "草稿暂缺",
        journals ? "neutral" : "warn"
      )}
      ${renderBadge(
        connectorSummary
          ? `在线连接 ${connectorSummary.online}/${connectorSummary.total}`
          : "连接状态暂缺",
        connectorSummary ? "neutral" : "warn"
      )}
      ${renderBadge(
        timeLogRecent
          ? `时间日志 ${timeLogRecent.events.length} 条`
          : "时间日志暂缺",
        timeLogRecent ? "neutral" : "warn"
      )}
      ${renderBadge(
        toolCatalog ? `工具 ${toolCatalog.length}` : "工具目录暂缺",
        toolCatalog ? "neutral" : "warn"
      )}
      <span class="status-strip__stamp">
        上次同步 ${escapeHtml(formatRelativeTime(state.lastRefreshedAt))}
      </span>
    </section>
  `;
}

function renderOverview(resources: DashboardResources) {
  const profile = asData(resources.profile);
  const journals = asData(resources.journals);
  const connectorSummary = asData(resources.connectorSummary);
  const healthSummary = asData(resources.healthSummary);
  const recentAudit = asData(resources.recentAudit);
  const coreHealth = asData(resources.coreHealth);
  const mcpHealth = asData(resources.mcpHealth);
  const toolCatalog = asData(resources.toolCatalog);

  const degradedResources = Object.entries(resources).filter(
    ([, resource]) => !isResourceReady(resource)
  );

  return `
    <section class="hero-panel">
      <div class="hero-panel__copy">
        <p>今日总览</p>
        <h2>先确认系统和数据都还在线。</h2>
        <p class="hero-panel__lead">
          ${
            profile
              ? `${escapeHtml(profile.displayName)} 的主控制面板。这里优先显示服务状态、连接情况和最近写入，不让你一上来就陷进技术细节。`
              : "当前档案暂时不可读，但控制台仍会尽量把剩余可用信息整理出来。"
          }
        </p>
        <div class="hero-panel__summary">
          <strong>当前档案摘要</strong>
          <p>${
            profile
              ? escapeHtml(profile.summary)
              : "还没拿到档案摘要时，这里会保留位置并提示当前状态。"
          }</p>
        </div>
        <div class="hero-panel__tags">
          ${
            profile
              ? profile.topPreferences
                  .map((item) => `<span>${escapeHtml(item)}</span>`)
                  .join("")
              : `<span>数据部分缺失时也保持可读</span><span>控制台优先</span>`
          }
        </div>
      </div>
      <div class="hero-panel__side">
        <div class="signal-block">
          <span>核心服务</span>
          <strong>${coreHealth ? "在线" : "离线"}</strong>
          <small>${coreHealth ? `运行于 ${coreHealth.environment}` : "请先检查服务链路"}</small>
        </div>
        <div class="signal-block">
          <span>MCP 网关</span>
          <strong>${mcpHealth ? "在线" : "离线"}</strong>
          <small>${toolCatalog ? `${toolCatalog.length} 个工具已登记` : "工具目录暂缺"}</small>
        </div>
      </div>
    </section>

    <section class="metric-grid">
      ${renderMetricCard(
        "记录草稿",
        journals ? `${journals.drafts.length}` : "—",
        journals ? `已归档 ${journals.entries.length} 条记录` : "当前未能读取记录数据",
        journals ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "连接器",
        connectorSummary
          ? `${connectorSummary.online}/${connectorSummary.total}`
          : "—",
        connectorSummary
          ? `退化 ${connectorSummary.degraded} · 离线 ${connectorSummary.offline}`
          : "当前未能读取连接摘要",
        connectorSummary && connectorSummary.offline === 0 ? "good" : "warn"
      )}
      ${renderMetricCard(
        "健康摘要",
        healthSummary ? formatNumber(healthSummary.stepCount) : "—",
        healthSummary
          ? `睡眠 ${formatNumber(healthSummary.sleepHours, "h")} · 静息心率 ${formatNumber(healthSummary.restingHeartRate)}`
          : "健康摘要暂缺",
        healthSummary ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "MCP 工具",
        toolCatalog ? `${toolCatalog.length}` : "—",
        toolCatalog ? "已可在控制台逐个测试" : "工具目录暂缺",
        toolCatalog ? "good" : "warn"
      )}
    </section>

    <section class="content-grid content-grid--overview">
      <article class="panel">
        <div class="panel__header">
          <p>优先关注</p>
          <h3>当前最需要注意的地方</h3>
        </div>
        ${
          degradedResources.length === 0
            ? `
              <div class="calm-state">
                <strong>当前所有核心数据流都可用。</strong>
                <p>这表示控制台、Core API 与 MCP Gateway 至少在当前刷新时刻都拿到了可读数据。</p>
              </div>
            `
            : `
              <ul class="stack-list">
                ${degradedResources
                  .map(
                    ([key, resource]) => `
                      <li>
                        <strong>${escapeHtml(formatResourceName(key))}</strong>
                        <span>${escapeHtml(
                          resource.status === "error"
                            ? resource.message
                            : "未知异常"
                        )}</span>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
        }
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>最近动作</p>
          <h3>最近写入和系统痕迹</h3>
        </div>
        ${
          recentAudit
            ? `
              <ul class="stack-list">
                ${recentAudit
                  .slice(0, 5)
                  .map(
                    (event) => `
                      <li>
                        <strong>${escapeHtml(event.action)}</strong>
                        <span>${escapeHtml(event.actor)} · ${formatDateTime(event.createdAt)}</span>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : renderResourceBanner(
                "最近动作",
                resources.recentAudit.status === "error"
                  ? resources.recentAudit.message
                  : "最近动作暂缺。",
                true
              )
        }
      </article>
    </section>
  `;
}

function renderProfile(resources: DashboardResources) {
  const profile = asData(resources.profile);
  const canEdit = profile !== null;

  return `
    <section class="content-grid content-grid--profile">
      <article class="panel panel--form">
        <div class="panel__header">
          <p>可编辑核心</p>
          <h3>档案摘要</h3>
        </div>
        ${
          canEdit
            ? `
              <form id="profile-form" class="editor-form">
                <label>
                  <span>显示名称</span>
                  <input
                    id="profile-display-name"
                    name="displayName"
                    type="text"
                    maxlength="80"
                    value="${escapeHtml(state.profileForm.displayName)}"
                    placeholder="例如 Asashiki"
                    ${state.savingProfile ? "disabled" : ""}
                  />
                </label>
                <label>
                  <span>摘要说明</span>
                  <textarea
                    id="profile-summary"
                    name="summary"
                    rows="7"
                    maxlength="1200"
                    placeholder="描述这个控制台服务于谁、优先关注什么。"
                    ${state.savingProfile ? "disabled" : ""}
                  >${escapeHtml(state.profileForm.summary)}</textarea>
                </label>
                <label>
                  <span>重点偏好</span>
                  <textarea
                    id="profile-preferences"
                    name="topPreferences"
                    rows="5"
                    placeholder="一行一个偏好，例如：journal-first"
                    ${state.savingProfile ? "disabled" : ""}
                  >${escapeHtml(state.profileForm.topPreferencesText)}</textarea>
                </label>
                <div class="panel__actions">
                  <button class="button button--primary" type="submit" ${state.savingProfile ? "disabled" : ""}>
                    ${state.savingProfile ? "保存中..." : "保存档案"}
                  </button>
                  <button
                    class="button button--ghost"
                    id="profile-reset-button"
                    type="button"
                    ${state.savingProfile || !state.profileForm.dirty ? "disabled" : ""}
                  >
                    重置
                  </button>
                </div>
              </form>
            `
            : renderResourceBanner(
                "档案摘要",
                resources.profile.status === "error"
                  ? resources.profile.message
                  : "档案数据暂缺。"
              )
        }
      </article>
      <article class="panel panel--preview">
        <div class="panel__header">
          <p>面向 Agent</p>
          <h3>当前对 Agent 可见的摘要</h3>
        </div>
        ${
          profile
            ? `
              <section class="profile-preview">
                <h4>${escapeHtml(profile.displayName)}</h4>
                <p>${escapeHtml(profile.summary)}</p>
                <div class="hero-panel__tags">
                  ${profile.topPreferences
                    .map((item) => `<span>${escapeHtml(item)}</span>`)
                    .join("")}
                </div>
              </section>
            `
            : renderEmptyState(
                "档案暂不可读",
                "当 Core API 或 Profile 数据暂时失联时，这里会提示当前不可预览。"
              )
        }
      </article>
    </section>
  `;
}

function renderJournals(resources: DashboardResources) {
  const journals = asData(resources.journals);

  return `
    <section class="content-grid content-grid--journals">
      <article class="panel panel--form">
        <div class="panel__header">
          <p>通过 Core API 写入</p>
          <h3>创建 Journal Draft</h3>
        </div>
        <p class="panel__copy">
          不知道写什么时，可以先写四类内容：今天发生了什么、临时想法、待办提醒、想留给 agent 的上下文。
        </p>
        <ul class="tag-row tag-row--guide">
          <li>今天做了什么</li>
          <li>当前卡点是什么</li>
          <li>下一步准备做什么</li>
          <li>要让 agent 记住什么</li>
        </ul>
        <form id="journal-form" class="editor-form">
          <label>
            <span>标题</span>
            <input
              id="journal-title"
              name="title"
              type="text"
              maxlength="120"
              placeholder="可选，不填则自动截取内容"
              value="${escapeHtml(state.journalForm.title)}"
              ${state.savingJournal ? "disabled" : ""}
            />
          </label>
          <label>
            <span>来源</span>
            <input
              id="journal-source"
              name="source"
              type="text"
              maxlength="60"
              value="${escapeHtml(state.journalForm.source)}"
              ${state.savingJournal ? "disabled" : ""}
            />
          </label>
          <label>
            <span>内容</span>
            <textarea
              id="journal-content"
              name="content"
              rows="9"
              maxlength="5000"
              placeholder="记录当前想法、操作痕迹或待办。"
              ${state.savingJournal ? "disabled" : ""}
            >${escapeHtml(state.journalForm.content)}</textarea>
          </label>
          <div class="panel__actions">
            <button class="button button--primary" type="submit" ${state.savingJournal ? "disabled" : ""}>
              ${state.savingJournal ? "保存中..." : "创建草稿"}
            </button>
          </div>
        </form>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>草稿队列</p>
          <h3>当前草稿</h3>
        </div>
        ${
          journals
            ? `
              <ul class="stack-list">
                ${journals.drafts
                  .slice(0, 6)
                  .map(
                    (draft) => `
                      <li>
                        <strong>${escapeHtml(draft.title)}</strong>
                        <span>${escapeHtml(draft.source)} · ${formatDateTime(draft.updatedAt)}</span>
                        <p>${escapeHtml(draft.body)}</p>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : renderResourceBanner(
                "草稿队列",
                resources.journals.status === "error"
                  ? resources.journals.message
                  : "记录数据暂缺。"
              )
        }
      </article>
    </section>
    <section class="panel">
      <div class="panel__header">
        <p>已归档记录</p>
        <h3>已有条目</h3>
      </div>
      ${
        journals
          ? `
            <div class="entry-grid">
              ${journals.entries
                .map(
                  (entry) => `
                    <article class="entry-card">
                      <span>${formatDateTime(entry.createdAt)}</span>
                      <strong>${escapeHtml(entry.title)}</strong>
                      <p>${escapeHtml(entry.body)}</p>
                      <small>${entry.tags.map((tag) => escapeHtml(tag)).join(" · ")}</small>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : renderEmptyState(
              "归档记录暂不可用",
              "当记录数据没拿到时，这里会保留版位并提示原因。"
            )
      }
    </section>
  `;
}

function renderConnectors(resources: DashboardResources) {
  const connectors = asData(resources.connectors);
  const summary = asData(resources.connectorSummary);
  const timeLogRecent = asData(resources.timeLogRecent);

  return `
    <section class="panel">
      <div class="panel__header">
        <p>页面说明</p>
        <h3>这里不是 agent 在线列表</h3>
      </div>
      <p class="panel__copy">
        这里展示的是系统里已经登记的连接器或数据通道，例如后端服务、外部数据源、后续要接入的 Supabase 或其他同步器。
        它更像“连接登记中心”，不是 Claude / Codex 当前在线人数。
      </p>
    </section>
    <section class="metric-grid">
      ${renderMetricCard(
        "已登记",
        summary ? `${summary.total}` : "—",
        summary ? "已登记连接数" : "摘要暂缺",
        "neutral"
      )}
      ${renderMetricCard(
        "在线",
        summary ? `${summary.online}` : "—",
        summary ? "当前正常在线" : "摘要暂缺",
        summary && summary.online > 0 ? "good" : "warn"
      )}
      ${renderMetricCard(
        "需关注",
        summary ? `${summary.degraded}` : "—",
        summary ? "需要人工关注" : "摘要暂缺",
        summary && summary.degraded === 0 ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "离线",
        summary ? `${summary.offline}` : "—",
        summary ? "当前不可用" : "摘要暂缺",
        summary && summary.offline === 0 ? "good" : "warn"
      )}
    </section>
    <section class="content-grid content-grid--profile">
      <article class="panel panel--form">
        <div class="panel__header">
          <p>Supabase 试点</p>
          <h3>时间日志查询测试</h3>
        </div>
        <p class="panel__copy">
          这里直接测试“某个时刻我在做什么”这条真实链路。输入一个时间点后，控制台会通过 Core API 去查询 Supabase 时间日志。
        </p>
        <form id="time-log-form" class="editor-form">
          <label>
            <span>查询时刻</span>
            <input
              id="time-log-at"
              name="at"
              type="datetime-local"
              value="${escapeHtml(state.timeLogQueryAt)}"
              ${state.timeLogLookup.pending ? "disabled" : ""}
            />
          </label>
          <div class="panel__actions">
            <button class="button button--primary" type="submit" ${state.timeLogLookup.pending ? "disabled" : ""}>
              ${state.timeLogLookup.pending ? "查询中..." : "查询这个时刻"}
            </button>
          </div>
        </form>
        ${
          state.timeLogLookup.error
            ? `<div class="inline-alert inline-alert--error"><strong>查询失败</strong><span>${escapeHtml(state.timeLogLookup.error)}</span></div>`
            : state.timeLogLookup.result
              ? renderTimeLogLookupResult(state.timeLogLookup.result)
              : `<div class="inline-alert"><span>还没有执行查询。你可以先试试某个你记得的时间点。</span></div>`
        }
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>最近预览</p>
          <h3>Supabase 时间日志样本</h3>
        </div>
        ${
          timeLogRecent
            ? `
              <ul class="stack-list">
                ${timeLogRecent.events
                  .map(
                    (event) => `
                      <li>
                        <strong>${escapeHtml(event.title)}</strong>
                        <span>${formatDateTime(event.startedAt)}${event.endedAt ? ` → ${formatDateTime(event.endedAt)}` : ""}</span>
                        <p>${escapeHtml(event.note ?? event.rawPreview ?? "无补充说明")}</p>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : renderResourceBanner(
                "Supabase 时间日志",
                resources.timeLogRecent.status === "error"
                  ? resources.timeLogRecent.message
                  : "当前还没有拿到时间日志样本。"
              )
        }
      </article>
    </section>
    ${
      connectors
        ? `
          <section class="connector-grid">
            ${connectors
              .map(
                (connector) => `
                  <article class="connector-card connector-card--${connector.status}">
                    <div class="connector-card__topline">
                      ${renderBadge(
                        formatConnectorStatus(connector.status),
                        connector.status === "online"
                          ? "good"
                          : connector.status === "degraded"
                            ? "warn"
                            : "bad"
                      )}
                      <span>${escapeHtml(connector.kind)}</span>
                    </div>
                    <h3>${escapeHtml(connector.name)}</h3>
                    <p>${escapeHtml(formatExposureLevel(connector.exposureLevel))} · 最近看到于 ${formatDateTime(connector.lastSeenAt)}</p>
                    <ul class="tag-row">
                      ${connector.capabilities
                        .map((capability) => `<li>${escapeHtml(capability)}</li>`)
                        .join("")}
                    </ul>
                    ${
                      connector.lastError
                        ? `<div class="inline-alert inline-alert--error">${escapeHtml(connector.lastError)}</div>`
                        : `<div class="inline-alert">最近一次成功：${escapeHtml(formatDateTime(connector.lastSuccessAt))}</div>`
                    }
                  </article>
                `
              )
              .join("")}
          </section>
        `
        : renderResourceBanner(
            "连接中心",
            resources.connectors.status === "error"
              ? resources.connectors.message
              : "连接器数据暂缺。"
          )
    }
  `;
}

function renderTools(resources: DashboardResources) {
  const toolCatalog = asData(resources.toolCatalog);
  const mcpReady = asData(resources.mcpHealth) !== null;

  return `
    <section class="panel">
      <div class="panel__header">
        <p>页面说明</p>
        <h3>这里是 mcp-gateway 的工具，不是连接状态页</h3>
      </div>
      <p class="panel__copy">
        当前应该能看到 6 个工具。这里展示的是 \`mcp-gateway\` 暴露出来的工具目录，并可逐个测试它们有没有正常连到后端。
      </p>
    </section>
    ${
      toolCatalog
        ? `
          <section class="tool-grid">
            ${toolCatalog
              .map((tool) => {
                const runState = state.toolRuns[tool.id];
                const result = runState?.result ?? null;

                return `
                  <article class="tool-card">
                    <div class="tool-card__topline">
                      ${renderBadge(tool.readOnlyHint ? "只读" : "写入", tool.readOnlyHint ? "neutral" : "warn")}
                      <span>${escapeHtml(tool.id)}</span>
                    </div>
                    <h3>${escapeHtml(formatToolTitle(tool))}</h3>
                    <p>${escapeHtml(formatToolDescription(tool))}</p>
                    <div class="panel__actions panel__actions--compact">
                      <button
                        class="button button--ghost"
                        type="button"
                        data-tool-test="${escapeHtml(tool.id)}"
                        ${!mcpReady || runState?.pending ? "disabled" : ""}
                      >
                        ${runState?.pending ? "测试中..." : "开始测试"}
                      </button>
                    </div>
                    ${
                      result
                        ? `
                          <div class="inline-alert ${result.ok ? "inline-alert--success" : "inline-alert--error"}">
                            <strong>${escapeHtml(result.summary)}</strong>
                            ${
                              result.preview
                                ? `<span>${escapeHtml(result.preview)}</span>`
                                : ""
                            }
                            <small>${escapeHtml(formatDateTime(result.executedAt))}</small>
                          </div>
                        `
                        : `
                          <div class="inline-alert">
                            <span>${mcpReady ? "尚未执行测试。" : "MCP Gateway 当前不可用，暂时不能发起测试。"}</span>
                          </div>
                        `
                    }
                  </article>
                `;
              })
              .join("")}
          </section>
        `
        : renderResourceBanner(
            "MCP 工具目录",
            resources.toolCatalog.status === "error"
              ? resources.toolCatalog.message
              : "MCP 工具目录暂缺。"
          )
    }
  `;
}

function renderActivity(resources: DashboardResources) {
  const coreHealth = asData(resources.coreHealth);
  const mcpHealth = asData(resources.mcpHealth);
  const latestHealth = asData(resources.latestHealth);
  const recentAudit = asData(resources.recentAudit);

  return `
    <section class="panel">
      <div class="panel__header">
        <p>页面说明</p>
        <h3>这个页面主要用于排查问题</h3>
      </div>
      <p class="panel__copy">
        平时你主要看总览、档案、记录和工具测试。只有当服务抽风、某块数据缺失，或者你想知道最近到底写进去了什么时，再来这里。
      </p>
    </section>
    <section class="content-grid content-grid--activity">
      <article class="panel">
        <div class="panel__header">
          <p>运行状态</p>
          <h3>服务运行状态</h3>
        </div>
        <ul class="stack-list stack-list--dense">
          <li>
            <strong>Core API</strong>
            <span>${coreHealth ? `在线 · ${formatNumber(coreHealth.uptimeSeconds, "s")}` : getResourceError(resources.coreHealth)}</span>
          </li>
          <li>
            <strong>MCP Gateway</strong>
            <span>${mcpHealth ? `在线 · ${formatNumber(mcpHealth.uptimeSeconds, "s")}` : getResourceError(resources.mcpHealth)}</span>
          </li>
          <li>
            <strong>最新健康快照</strong>
            <span>${latestHealth ? `${formatDateTime(latestHealth.capturedAt)} · ${escapeHtml(latestHealth.note ?? "无备注")}` : getResourceError(resources.latestHealth)}</span>
          </li>
        </ul>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>审计日志</p>
          <h3>最近审计事件</h3>
        </div>
        ${
          recentAudit
            ? `
              <ul class="stack-list">
                ${recentAudit
                  .map(
                    (event) => `
                      <li>
                        <strong>${escapeHtml(event.action)}</strong>
                        <span>${escapeHtml(event.targetType)} / ${escapeHtml(event.targetId)}</span>
                        <small>${escapeHtml(event.actor)} · ${formatDateTime(event.createdAt)}</small>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : renderResourceBanner(
                "审计日志",
                resources.recentAudit.status === "error"
                  ? resources.recentAudit.message
                  : "审计数据暂缺。",
                true
              )
        }
      </article>
    </section>
    <section class="panel">
      <div class="panel__header">
        <p>数据完整度</p>
        <h3>当前数据面是否完整</h3>
      </div>
      <div class="availability-grid">
        ${Object.entries(resources)
          .map(
            ([key, resource]) => `
              <article class="availability-card">
                <strong>${escapeHtml(formatResourceName(key))}</strong>
                ${renderBadge(
                  resource.status === "ready" ? "正常" : "异常",
                  resource.status === "ready" ? "good" : "bad"
                )}
                <p>${escapeHtml(
                  resource.status === "ready"
                    ? "当前刷新中已成功取到数据。"
                    : resource.message
                )}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderView(resources: DashboardResources) {
  switch (state.activeView) {
    case "profile":
      return renderProfile(resources);
    case "journals":
      return renderJournals(resources);
    case "connectors":
      return renderConnectors(resources);
    case "tools":
      return renderTools(resources);
    case "activity":
      return renderActivity(resources);
    case "overview":
    default:
      return renderOverview(resources);
  }
}

function renderShell() {
  const meta = viewMeta[state.activeView];
  const resources = state.resources;
  const hasResources = resources !== null;
  const showLoadingScreen = state.loading && !hasResources;

  root.innerHTML = `
    <main class="console-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <span class="sidebar__eyebrow">Asashiki</span>
          <strong>个人控制台</strong>
          <p>安静、克制、可长期使用的个人控制台。</p>
        </div>
        <nav class="sidebar__nav">
          ${renderNav()}
        </nav>
        <div class="sidebar__foot">
          <p>当前阶段</p>
          <strong>控制台优先</strong>
          <small>Milestone 8 · 第一批</small>
        </div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div class="topbar__copy">
            <p class="topbar__eyebrow">${meta.eyebrow}</p>
            <h1>${meta.label}</h1>
            <p class="topbar__description">${meta.description}</p>
          </div>
          <div class="topbar__actions">
            <button id="refresh-button" class="button button--ghost" type="button" ${state.loading ? "disabled" : ""}>
              ${state.loading ? "刷新中..." : "刷新"}
            </button>
          </div>
        </header>
        ${renderTopStatus(resources)}
        ${
          state.flash
            ? `<section class="flash flash--${state.flash.tone}">${escapeHtml(state.flash.text)}</section>`
            : ""
        }
        ${
          showLoadingScreen
            ? renderLoadingShell()
            : hasResources && resources
              ? renderView(resources)
              : renderEmptyState(
                  "等待首次同步",
                  "控制台会在首次拿到数据后展示完整内容。"
                )
        }
      </section>
    </main>
  `;

  attachInteractions();
}

function attachInteractions() {
  const refreshButton =
    document.querySelector<HTMLButtonElement>("#refresh-button");
  refreshButton?.addEventListener("click", async () => {
    await refreshData();
  });

  const profileForm = document.querySelector<HTMLFormElement>("#profile-form");
  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfile();
  });

  const profileResetButton = document.querySelector<HTMLButtonElement>(
    "#profile-reset-button"
  );
  profileResetButton?.addEventListener("click", () => {
    if (state.resources) {
      syncProfileForm(state.resources, true);
      renderShell();
    }
  });

  const profileDisplayName =
    document.querySelector<HTMLInputElement>("#profile-display-name");
  const profileSummary =
    document.querySelector<HTMLTextAreaElement>("#profile-summary");
  const profilePreferences = document.querySelector<HTMLTextAreaElement>(
    "#profile-preferences"
  );

  profileDisplayName?.addEventListener("input", () => {
    state.profileForm.displayName = profileDisplayName.value;
    state.profileForm.dirty = true;
  });
  profileSummary?.addEventListener("input", () => {
    state.profileForm.summary = profileSummary.value;
    state.profileForm.dirty = true;
  });
  profilePreferences?.addEventListener("input", () => {
    state.profileForm.topPreferencesText = profilePreferences.value;
    state.profileForm.dirty = true;
  });

  const journalForm = document.querySelector<HTMLFormElement>("#journal-form");
  journalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createJournalDraft();
  });

  const journalTitle =
    document.querySelector<HTMLInputElement>("#journal-title");
  const journalSource =
    document.querySelector<HTMLInputElement>("#journal-source");
  const journalContent =
    document.querySelector<HTMLTextAreaElement>("#journal-content");

  journalTitle?.addEventListener("input", () => {
    state.journalForm.title = journalTitle.value;
  });
  journalSource?.addEventListener("input", () => {
    state.journalForm.source = journalSource.value;
  });
  journalContent?.addEventListener("input", () => {
    state.journalForm.content = journalContent.value;
  });

  const timeLogForm = document.querySelector<HTMLFormElement>("#time-log-form");
  timeLogForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await lookupTimeLogAt();
  });

  const timeLogAt = document.querySelector<HTMLInputElement>("#time-log-at");
  timeLogAt?.addEventListener("input", () => {
    state.timeLogQueryAt = timeLogAt.value;
  });

  document
    .querySelectorAll<HTMLButtonElement>("[data-tool-test]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const toolId = button.dataset.toolTest;

        if (!toolId) {
          return;
        }

        await runToolTest(toolId);
      });
    });
}

async function saveProfile() {
  const payload = {
    displayName: state.profileForm.displayName.trim(),
    summary: state.profileForm.summary.trim(),
    topPreferences: parsePreferences(state.profileForm.topPreferencesText)
  };

  const parsed = profileSummaryInputSchema.safeParse(payload);

  if (!parsed.success) {
    state.flash = {
      tone: "error",
      text: "档案表单还不完整，请检查名称、摘要和偏好列表。"
    };
    renderShell();
    return;
  }

  state.savingProfile = true;
  state.flash = null;
  renderShell();

  try {
    const response = await fetch(`${coreApiBaseUrl}/api/profile/summary`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(parsed.data)
    });

    if (!response.ok) {
      throw new Error(`档案保存失败，响应 ${response.status}`);
    }

    const saved = profileSummarySavedSchema.parse(await response.json());
    state.profileForm.dirty = false;
    state.flash = {
      tone: "success",
      text: `已更新档案：${saved.displayName}`
    };
    await refreshData(true);
  } catch (error) {
    state.flash = {
      tone: "error",
      text:
        error instanceof Error
          ? error.message
          : "保存档案时发生未知错误。"
    };
  } finally {
    state.savingProfile = false;
    renderShell();
  }
}

async function createJournalDraft() {
  const content = state.journalForm.content.trim();

  if (!content) {
    state.flash = {
      tone: "error",
      text: "记录内容不能为空。"
    };
    renderShell();
    return;
  }

  state.savingJournal = true;
  state.flash = null;
  renderShell();

  try {
    const response = await fetch(`${coreApiBaseUrl}/api/journals/drafts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: state.journalForm.title.trim() || undefined,
        source: state.journalForm.source.trim() || "admin-dashboard",
        content
      })
    });

    if (!response.ok) {
      throw new Error(`创建 journal draft 失败，响应 ${response.status}`);
    }

    const saved = journalDraftSavedSchema.parse(await response.json());
    state.journalForm = {
      title: "",
      source: state.journalForm.source || "admin-dashboard",
      content: ""
    };
    state.flash = {
      tone: "success",
      text: `已创建 draft：${saved.title}`
    };
    await refreshData(true);
  } catch (error) {
    state.flash = {
      tone: "error",
      text:
        error instanceof Error
          ? error.message
          : "创建记录草稿时发生未知错误。"
    };
  } finally {
    state.savingJournal = false;
    renderShell();
  }
}

async function runToolTest(toolId: string) {
  state.toolRuns[toolId] = {
    pending: true,
    result: state.toolRuns[toolId]?.result ?? null
  };
  renderShell();

  try {
    const response = await fetch(`${mcpGatewayBaseUrl}/tools/${toolId}/test`, {
      method: "POST"
    });

    if (!response.ok) {
      throw new Error(`工具测试失败，响应 ${response.status}`);
    }

    state.toolRuns[toolId] = {
      pending: false,
      result: mcpToolTestResultSchema.parse(await response.json())
    };
    state.flash = {
      tone: "success",
      text: `MCP 工具 ${toolId} 已完成测试。`
    };
    await refreshData(true);
  } catch (error) {
    state.toolRuns[toolId] = {
      pending: false,
      result: {
        toolId,
        ok: false,
        summary:
          error instanceof Error
            ? error.message
            : "MCP 工具测试时发生未知错误。",
        preview: null,
        executedAt: new Date().toISOString()
      }
    };
    state.flash = {
      tone: "error",
      text: `MCP 工具 ${toolId} 测试失败。`
    };
  } finally {
    renderShell();
  }
}

async function lookupTimeLogAt() {
  if (!state.timeLogQueryAt) {
    state.timeLogLookup = {
      pending: false,
      result: null,
      error: "请先选择一个要查询的时间。"
    };
    renderShell();
    return;
  }

  state.timeLogLookup = {
    pending: true,
    result: state.timeLogLookup.result,
    error: null
  };
  renderShell();

  try {
    const at = new Date(state.timeLogQueryAt);

    if (Number.isNaN(at.getTime())) {
      throw new Error("时间格式无效，请重新选择。");
    }

    const search = new URLSearchParams({
      at: at.toISOString()
    });
    const response = await fetch(
      `${coreApiBaseUrl}/api/time-log/lookup?${search.toString()}`
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      throw new Error(payload?.message ?? `时间日志查询失败，响应 ${response.status}`);
    }

    state.timeLogLookup = {
      pending: false,
      result: timeLogLookupResultSchema.parse(await response.json()),
      error: null
    };
  } catch (error) {
    state.timeLogLookup = {
      pending: false,
      result: null,
      error:
        error instanceof Error
          ? error.message
          : "时间日志查询时发生未知错误。"
    };
  } finally {
    renderShell();
  }
}

async function refreshData(quiet = false) {
  state.loading = true;

  if (!quiet) {
    state.flash = null;
  }

  renderShell();

  try {
    const resources = await loadDashboardResources();
    state.resources = resources;
    state.lastRefreshedAt = new Date().toISOString();
    syncProfileForm(resources);
  } finally {
    state.loading = false;
    renderShell();
  }
}

window.addEventListener("hashchange", () => {
  state.activeView = getActiveView();
  renderShell();
});

void refreshData();
