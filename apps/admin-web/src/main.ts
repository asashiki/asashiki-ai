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
  serviceHealthSchema
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
  ServiceHealth
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
  toolRuns: {}
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
    label: "Overview",
    eyebrow: "Control Room",
    description: "总览系统、数据流和今天最需要注意的信号。"
  },
  profile: {
    label: "Profile",
    eyebrow: "Editable Core",
    description: "把核心文字资料从种子数据推进到可直接维护的控制台表单。"
  },
  journals: {
    label: "Journals",
    eyebrow: "Write Path",
    description: "管理草稿、查看历史记录，并保持所有写入都经由 Core API。"
  },
  connectors: {
    label: "Connectors",
    eyebrow: "Registry",
    description: "查看连接状态、暴露边界和最近的连接异常。"
  },
  tools: {
    label: "MCP Tools",
    eyebrow: "Verification",
    description: "直接从控制台执行当前工具 smoke，确认 gateway 到后端的链路。"
  },
  activity: {
    label: "Activity",
    eyebrow: "Signals",
    description: "把运行状态、审计事件和缺失数据集中放在一页里。"
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
    recentAudit,
    toolCatalog
  ] = await Promise.all([
    loadResource("Core API 健康状态", () =>
      loadHealth(`${coreApiBaseUrl}/health`, "Core API 健康状态")
    ),
    loadResource("MCP Gateway 健康状态", () =>
      loadHealth(`${mcpGatewayBaseUrl}/health`, "MCP Gateway 健康状态")
    ),
    loadResource("Profile", () =>
      loadJson(
        `${coreApiBaseUrl}/api/profile/summary`,
        profileSummarySchema,
        "Profile"
      )
    ),
    loadResource("Journals", () =>
      loadJson(
        `${coreApiBaseUrl}/api/journals`,
        journalCollectionSchema,
        "Journals"
      )
    ),
    loadResource("Health Summary", () =>
      loadJson(
        `${coreApiBaseUrl}/api/health/summary`,
        healthSummarySchema,
        "Health Summary"
      )
    ),
    loadResource("Latest Health Snapshot", () =>
      loadJson(
        `${coreApiBaseUrl}/api/health/latest`,
        healthSnapshotSchema,
        "Latest Health Snapshot"
      )
    ),
    loadResource("Connectors", () =>
      loadJson(
        `${coreApiBaseUrl}/api/connectors`,
        connectorSchema.array(),
        "Connectors"
      )
    ),
    loadResource("Connector Summary", () =>
      loadJson(
        `${coreApiBaseUrl}/api/connectors/summary`,
        connectorSummarySchema,
        "Connector Summary"
      )
    ),
    loadResource("Recent Audit", () =>
      loadJson(
        `${coreApiBaseUrl}/api/audit/recent`,
        auditEventSchema.array(),
        "Recent Audit"
      )
    ),
    loadResource("MCP Tool Catalog", () =>
      loadJson(
        `${mcpGatewayBaseUrl}/tools/catalog`,
        {
          parse(value: unknown) {
            const payload = value as { tools?: unknown };
            return mcpToolCatalogSchema.parse(payload.tools ?? []);
          }
        },
        "MCP Tool Catalog"
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
        <p>Unavailable</p>
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
        journals ? `Draft ${journals.drafts.length}` : "Draft 暂缺",
        journals ? "neutral" : "warn"
      )}
      ${renderBadge(
        connectorSummary
          ? `在线连接 ${connectorSummary.online}/${connectorSummary.total}`
          : "连接状态暂缺",
        connectorSummary ? "neutral" : "warn"
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
        <p>Personal console</p>
        <h2>${
          profile
            ? escapeHtml(profile.summary)
            : "把控制台做成你真正愿意长期打开的个人工作台。"
        }</h2>
        <p class="hero-panel__lead">
          ${
            profile
              ? `${escapeHtml(profile.displayName)} 的主控制面板，优先展示系统状态、连接健康和最近的写入痕迹。`
              : "当前 profile 暂时不可读，但控制台仍会尽量呈现其余可用信息。"
          }
        </p>
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
          <span>Core API</span>
          <strong>${coreHealth ? "在线" : "离线"}</strong>
          <small>${coreHealth ? `运行于 ${coreHealth.environment}` : "请先检查服务链路"}</small>
        </div>
        <div class="signal-block">
          <span>MCP Gateway</span>
          <strong>${mcpHealth ? "在线" : "离线"}</strong>
          <small>${toolCatalog ? `${toolCatalog.length} 个工具已登记` : "工具目录暂缺"}</small>
        </div>
      </div>
    </section>

    <section class="metric-grid">
      ${renderMetricCard(
        "Journals",
        journals ? `${journals.drafts.length}` : "—",
        journals ? `${journals.entries.length} 条 entries` : "当前未能读取 journaling 数据",
        journals ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "Connectors",
        connectorSummary
          ? `${connectorSummary.online}/${connectorSummary.total}`
          : "—",
        connectorSummary
          ? `退化 ${connectorSummary.degraded} · 离线 ${connectorSummary.offline}`
          : "当前未能读取连接摘要",
        connectorSummary && connectorSummary.offline === 0 ? "good" : "warn"
      )}
      ${renderMetricCard(
        "Health",
        healthSummary ? formatNumber(healthSummary.stepCount) : "—",
        healthSummary
          ? `睡眠 ${formatNumber(healthSummary.sleepHours, "h")} · 静息心率 ${formatNumber(healthSummary.restingHeartRate)}`
          : "健康摘要暂缺",
        healthSummary ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "MCP Tools",
        toolCatalog ? `${toolCatalog.length}` : "—",
        toolCatalog ? "已可在控制台逐个 smoke" : "工具目录暂缺",
        toolCatalog ? "good" : "warn"
      )}
    </section>

    <section class="content-grid content-grid--overview">
      <article class="panel">
        <div class="panel__header">
          <p>Attention</p>
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
                        <strong>${escapeHtml(key)}</strong>
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
          <p>Recent Activity</p>
          <h3>最近系统痕迹</h3>
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
                "Recent Activity",
                resources.recentAudit.status === "error"
                  ? resources.recentAudit.message
                  : "Recent Activity 暂缺。",
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
          <p>Editable Core</p>
          <h3>Profile Summary</h3>
        </div>
        ${
          canEdit
            ? `
              <form id="profile-form" class="editor-form">
                <label>
                  <span>Display Name</span>
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
                  <span>Summary</span>
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
                  <span>Top Preferences</span>
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
                    ${state.savingProfile ? "Saving..." : "Save Profile"}
                  </button>
                  <button
                    class="button button--ghost"
                    id="profile-reset-button"
                    type="button"
                    ${state.savingProfile || !state.profileForm.dirty ? "disabled" : ""}
                  >
                    Reset
                  </button>
                </div>
              </form>
            `
            : renderResourceBanner(
                "Profile Summary",
                resources.profile.status === "error"
                  ? resources.profile.message
                  : "Profile 数据暂缺。"
              )
        }
      </article>
      <article class="panel panel--preview">
        <div class="panel__header">
          <p>Agent-facing View</p>
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
                "Profile 暂不可读",
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
          <p>Write Through Core API</p>
          <h3>创建 Journal Draft</h3>
        </div>
        <form id="journal-form" class="editor-form">
          <label>
            <span>Title</span>
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
            <span>Source</span>
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
            <span>Content</span>
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
              ${state.savingJournal ? "Saving..." : "Create Draft"}
            </button>
          </div>
        </form>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>Draft Queue</p>
          <h3>当前 Drafts</h3>
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
                "Draft Queue",
                resources.journals.status === "error"
                  ? resources.journals.message
                  : "Journal 数据暂缺。"
              )
        }
      </article>
    </section>
    <section class="panel">
      <div class="panel__header">
        <p>Published Entries</p>
        <h3>已有 Entries</h3>
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
              "Entries 暂不可用",
              "当 Journals 数据没拿到时，这里会保留版位并提示原因。"
            )
      }
    </section>
  `;
}

function renderConnectors(resources: DashboardResources) {
  const connectors = asData(resources.connectors);
  const summary = asData(resources.connectorSummary);

  return `
    <section class="metric-grid">
      ${renderMetricCard(
        "Total",
        summary ? `${summary.total}` : "—",
        summary ? "已登记连接数" : "摘要暂缺",
        "neutral"
      )}
      ${renderMetricCard(
        "Online",
        summary ? `${summary.online}` : "—",
        summary ? "当前正常在线" : "摘要暂缺",
        summary && summary.online > 0 ? "good" : "warn"
      )}
      ${renderMetricCard(
        "Degraded",
        summary ? `${summary.degraded}` : "—",
        summary ? "需要人工关注" : "摘要暂缺",
        summary && summary.degraded === 0 ? "neutral" : "warn"
      )}
      ${renderMetricCard(
        "Offline",
        summary ? `${summary.offline}` : "—",
        summary ? "当前不可用" : "摘要暂缺",
        summary && summary.offline === 0 ? "good" : "warn"
      )}
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
                        connector.status === "online"
                          ? "Online"
                          : connector.status === "degraded"
                            ? "Degraded"
                            : "Offline",
                        connector.status === "online"
                          ? "good"
                          : connector.status === "degraded"
                            ? "warn"
                            : "bad"
                      )}
                      <span>${escapeHtml(connector.kind)}</span>
                    </div>
                    <h3>${escapeHtml(connector.name)}</h3>
                    <p>${escapeHtml(connector.exposureLevel)} · 最近看到于 ${formatDateTime(connector.lastSeenAt)}</p>
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
            "Connector Center",
            resources.connectors.status === "error"
              ? resources.connectors.message
              : "Connector 数据暂缺。"
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
        <p>Gateway Smoke</p>
        <h3>逐个测试当前 MCP 工具</h3>
      </div>
      <p class="panel__copy">
        这些测试会直接打到 \`mcp-gateway\` 的工具 smoke 接口，用来确认当前工具链路是否还活着。
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
                      ${renderBadge(tool.readOnlyHint ? "Read-only" : "Write path", tool.readOnlyHint ? "neutral" : "warn")}
                      <span>${escapeHtml(tool.id)}</span>
                    </div>
                    <h3>${escapeHtml(tool.title)}</h3>
                    <p>${escapeHtml(tool.description)}</p>
                    <div class="panel__actions panel__actions--compact">
                      <button
                        class="button button--ghost"
                        type="button"
                        data-tool-test="${escapeHtml(tool.id)}"
                        ${!mcpReady || runState?.pending ? "disabled" : ""}
                      >
                        ${runState?.pending ? "Testing..." : "Run Smoke"}
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
            "MCP Tool Catalog",
            resources.toolCatalog.status === "error"
              ? resources.toolCatalog.message
              : "MCP Tool Catalog 暂缺。"
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
    <section class="content-grid content-grid--activity">
      <article class="panel">
        <div class="panel__header">
          <p>Runtime</p>
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
            <strong>Latest Health Snapshot</strong>
            <span>${latestHealth ? `${formatDateTime(latestHealth.capturedAt)} · ${escapeHtml(latestHealth.note ?? "无备注")}` : getResourceError(resources.latestHealth)}</span>
          </li>
        </ul>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>Audit Trail</p>
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
                "Audit Trail",
                resources.recentAudit.status === "error"
                  ? resources.recentAudit.message
                  : "Audit 数据暂缺。",
                true
              )
        }
      </article>
    </section>
    <section class="panel">
      <div class="panel__header">
        <p>Data Surfaces</p>
        <h3>当前数据面是否完整</h3>
      </div>
      <div class="availability-grid">
        ${Object.entries(resources)
          .map(
            ([key, resource]) => `
              <article class="availability-card">
                <strong>${escapeHtml(key)}</strong>
                ${renderBadge(
                  resource.status === "ready" ? "Ready" : "Issue",
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
          <strong>Personal Console</strong>
          <p>安静、克制、可长期使用的个人控制台。</p>
        </div>
        <nav class="sidebar__nav">
          ${renderNav()}
        </nav>
        <div class="sidebar__foot">
          <p>Current Step</p>
          <strong>Admin-first Console</strong>
          <small>Milestone 8 · slice 1</small>
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
              ${state.loading ? "Refreshing..." : "Refresh"}
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
      text: "Profile 表单还不完整，请检查名称、摘要和偏好列表。"
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
      throw new Error(`Profile 保存失败，响应 ${response.status}`);
    }

    const saved = profileSummarySavedSchema.parse(await response.json());
    state.profileForm.dirty = false;
    state.flash = {
      tone: "success",
      text: `已更新 Profile：${saved.displayName}`
    };
    await refreshData(true);
  } catch (error) {
    state.flash = {
      tone: "error",
      text:
        error instanceof Error
          ? error.message
          : "保存 Profile 时发生未知错误。"
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
      text: "Journal content 不能为空。"
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
          : "创建 journal draft 时发生未知错误。"
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
      text: `MCP 工具 ${toolId} 已完成 smoke。`
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
