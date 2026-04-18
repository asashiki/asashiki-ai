import {
  auditEventSchema,
  connectorSchema,
  connectorSummarySchema,
  healthSnapshotSchema,
  healthSummarySchema,
  journalCollectionSchema,
  journalDraftSavedSchema,
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
  ProfileSummary,
  ServiceHealth
} from "@asashiki/schemas";
import "./style.css";

type ViewId =
  | "overview"
  | "journals"
  | "connectors"
  | "health"
  | "activity";

type DashboardData = {
  coreHealth: ServiceHealth;
  mcpHealth: ServiceHealth;
  profile: ProfileSummary;
  journals: JournalCollection;
  healthSummary: HealthSummary;
  latestHealth: HealthSnapshot;
  connectors: Connector[];
  connectorSummary: ConnectorSummary;
  recentAudit: AuditEvent[];
};

type AppState = {
  activeView: ViewId;
  data: DashboardData | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  notice: string | null;
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
  data: null,
  loading: true,
  submitting: false,
  error: null,
  notice: null
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
    eyebrow: "Control Plane",
    description: "总览当前核心状态、数据量与模块边界。"
  },
  journals: {
    label: "Journals",
    eyebrow: "Write Path",
    description: "通过 Core API 创建和查看 journal drafts 与 entries。"
  },
  connectors: {
    label: "Connectors",
    eyebrow: "Operational",
    description: "查看连接器在线状态、退化情况与暴露能力。"
  },
  health: {
    label: "Health",
    eyebrow: "Snapshot",
    description: "阅读最新健康摘要与最新采样快照。"
  },
  activity: {
    label: "Activity",
    eyebrow: "System",
    description: "检查最近操作轨迹与系统运行状态。"
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
    return "N/A";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value}${suffix}`;
}

function getActiveView(): ViewId {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const views: ViewId[] = [
    "overview",
    "journals",
    "connectors",
    "health",
    "activity"
  ];

  return views.includes(hash as ViewId) ? (hash as ViewId) : "overview";
}

async function loadHealth(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load health from ${url}`);
  }

  return serviceHealthSchema.parse(await response.json());
}

async function loadJson<T>(
  url: string,
  parser: { parse: (value: unknown) => T }
) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }

  return parser.parse(await response.json());
}

async function loadDashboardData() {
  const [
    coreHealth,
    mcpHealth,
    profile,
    journals,
    healthSummary,
    latestHealth,
    connectors,
    connectorSummary,
    recentAudit
  ] = await Promise.all([
    loadHealth(`${coreApiBaseUrl}/health`),
    loadHealth(`${mcpGatewayBaseUrl}/health`),
    loadJson(`${coreApiBaseUrl}/api/profile/summary`, profileSummarySchema),
    loadJson(`${coreApiBaseUrl}/api/journals`, journalCollectionSchema),
    loadJson(`${coreApiBaseUrl}/api/health/summary`, healthSummarySchema),
    loadJson(`${coreApiBaseUrl}/api/health/latest`, healthSnapshotSchema),
    loadJson(`${coreApiBaseUrl}/api/connectors`, connectorSchema.array()),
    loadJson(
      `${coreApiBaseUrl}/api/connectors/summary`,
      connectorSummarySchema
    ),
    loadJson(`${coreApiBaseUrl}/api/audit/recent`, auditEventSchema.array())
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
    recentAudit
  } satisfies DashboardData;
}

function renderNav() {
  return (Object.entries(viewMeta) as Array<[ViewId, (typeof viewMeta)[ViewId]]>)
    .map(
      ([viewId, meta]) => `
        <a class="nav-link ${state.activeView === viewId ? "is-active" : ""}" href="#/${viewId}">
          <span class="nav-link__eyebrow">${meta.eyebrow}</span>
          <strong>${meta.label}</strong>
        </a>
      `
    )
    .join("");
}

function renderOverview(data: DashboardData) {
  return `
    <section class="hero-card hero-card--overview">
      <p class="hero-card__eyebrow">Private editorial dashboard</p>
      <h1>${escapeHtml(data.profile.summary)}</h1>
      <p class="hero-card__lead">Milestone 3 把后台从单页状态块推进到真正可导航的控制台，重点验证可见性与写入链路。</p>
      <div class="hero-card__tags">
        ${data.profile.topPreferences
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("")}
      </div>
    </section>
    <section class="card-grid card-grid--metrics">
      <article class="metric-card">
        <span>Journal Drafts</span>
        <strong>${data.journals.drafts.length}</strong>
        <p>统一由 Core API 承接写入</p>
      </article>
      <article class="metric-card">
        <span>Connectors Online</span>
        <strong>${data.connectorSummary.online}/${data.connectorSummary.total}</strong>
        <p>退化 ${data.connectorSummary.degraded} · 离线 ${data.connectorSummary.offline}</p>
      </article>
      <article class="metric-card">
        <span>Latest Steps</span>
        <strong>${formatNumber(data.healthSummary.stepCount)}</strong>
        <p>睡眠 ${formatNumber(data.healthSummary.sleepHours, "h")} · RHR ${formatNumber(data.healthSummary.restingHeartRate)}</p>
      </article>
    </section>
    <section class="split-grid">
      <article class="panel">
        <div class="panel__header">
          <p>Module Snapshot</p>
          <h2>本期 MVP 模块状态</h2>
        </div>
        <ul class="rail-list">
          <li><strong>Core API</strong><span>${data.coreHealth.status} · ${formatDateTime(data.coreHealth.startedAt)}</span></li>
          <li><strong>MCP Gateway</strong><span>${data.mcpHealth.status} · 端口 ${data.mcpHealth.app.port}</span></li>
          <li><strong>Journal</strong><span>${data.journals.drafts.length} drafts / ${data.journals.entries.length} entries</span></li>
          <li><strong>Connector Registry</strong><span>${data.connectors.length} connectors loaded</span></li>
        </ul>
      </article>
      <article class="panel panel--accent">
        <div class="panel__header">
          <p>Recent Signals</p>
          <h2>最新系统痕迹</h2>
        </div>
        <ul class="stack-list">
          ${data.recentAudit
            .slice(0, 4)
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
      </article>
    </section>
  `;
}

function renderJournals(data: DashboardData) {
  return `
    <section class="split-grid split-grid--journals">
      <article class="panel panel--form">
        <div class="panel__header">
          <p>Write Through Core API</p>
          <h2>创建 Journal Draft</h2>
        </div>
        <form id="journal-form" class="journal-form">
          <label>
            <span>Title</span>
            <input name="title" type="text" maxlength="120" placeholder="可选，不填会自动截取内容生成标题" />
          </label>
          <label>
            <span>Source</span>
            <input name="source" type="text" maxlength="60" value="admin-dashboard" />
          </label>
          <label>
            <span>Content</span>
            <textarea name="content" rows="8" maxlength="5000" placeholder="输入一段新的 journal draft 内容..." required></textarea>
          </label>
          <button class="action-button" type="submit" ${state.submitting ? "disabled" : ""}>
            ${state.submitting ? "Saving..." : "Create Draft"}
          </button>
        </form>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>Draft Queue</p>
          <h2>当前 Drafts</h2>
        </div>
        <ul class="stack-list">
          ${data.journals.drafts
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
      </article>
    </section>
    <section class="panel">
      <div class="panel__header">
        <p>Published Entries</p>
        <h2>已有 Journal Entries</h2>
      </div>
      <div class="entry-grid">
        ${data.journals.entries
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
    </section>
  `;
}

function renderConnectors(data: DashboardData) {
  return `
    <section class="card-grid card-grid--metrics">
      <article class="metric-card">
        <span>Total Connectors</span>
        <strong>${data.connectorSummary.total}</strong>
        <p>统一注册表视图</p>
      </article>
      <article class="metric-card">
        <span>Online</span>
        <strong>${data.connectorSummary.online}</strong>
        <p>当前可读写或可读能力在线</p>
      </article>
      <article class="metric-card">
        <span>Degraded / Offline</span>
        <strong>${data.connectorSummary.degraded + data.connectorSummary.offline}</strong>
        <p>等待后续修复或集成</p>
      </article>
    </section>
    <section class="connector-grid">
      ${data.connectors
        .map(
          (connector) => `
            <article class="connector-card connector-card--${connector.status}">
              <div class="connector-card__topline">
                <span>${escapeHtml(connector.kind)}</span>
                <strong>${escapeHtml(connector.status)}</strong>
              </div>
              <h2>${escapeHtml(connector.name)}</h2>
              <p>Last seen ${formatDateTime(connector.lastSeenAt)}</p>
              <ul class="tag-list">
                ${connector.capabilities
                  .map((capability) => `<li>${escapeHtml(capability)}</li>`)
                  .join("")}
              </ul>
              <small>Exposure: ${escapeHtml(connector.exposureLevel)}</small>
              ${
                connector.lastError
                  ? `<div class="connector-card__error">${escapeHtml(connector.lastError)}</div>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderHealth(data: DashboardData) {
  return `
    <section class="split-grid">
      <article class="panel panel--accent">
        <div class="panel__header">
          <p>Current Summary</p>
          <h2>最新健康摘要</h2>
        </div>
        <div class="health-metrics">
          <div><span>Resting Heart Rate</span><strong>${formatNumber(data.healthSummary.restingHeartRate)}</strong></div>
          <div><span>Sleep Hours</span><strong>${formatNumber(data.healthSummary.sleepHours, "h")}</strong></div>
          <div><span>Step Count</span><strong>${formatNumber(data.healthSummary.stepCount)}</strong></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel__header">
          <p>Latest Snapshot</p>
          <h2>最近一次采样</h2>
        </div>
        <ul class="rail-list">
          <li><strong>Captured At</strong><span>${formatDateTime(data.latestHealth.capturedAt)}</span></li>
          <li><strong>Note</strong><span>${escapeHtml(data.latestHealth.note ?? "No note")}</span></li>
          <li><strong>Snapshot ID</strong><span>${escapeHtml(data.latestHealth.id)}</span></li>
        </ul>
      </article>
    </section>
  `;
}

function renderActivity(data: DashboardData) {
  return `
    <section class="split-grid">
      <article class="panel">
        <div class="panel__header">
          <p>Runtime</p>
          <h2>系统状态</h2>
        </div>
        <ul class="rail-list">
          <li><strong>Core API</strong><span>${data.coreHealth.status} · ${formatDateTime(data.coreHealth.startedAt)}</span></li>
          <li><strong>MCP Gateway</strong><span>${data.mcpHealth.status} · ${formatDateTime(data.mcpHealth.startedAt)}</span></li>
          <li><strong>Core Uptime</strong><span>${formatNumber(data.coreHealth.uptimeSeconds, "s")}</span></li>
          <li><strong>MCP Uptime</strong><span>${formatNumber(data.mcpHealth.uptimeSeconds, "s")}</span></li>
        </ul>
      </article>
      <article class="panel panel--accent">
        <div class="panel__header">
          <p>Audit Trail</p>
          <h2>最近操作</h2>
        </div>
        <ul class="stack-list">
          ${data.recentAudit
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
      </article>
    </section>
  `;
}

function renderView(data: DashboardData) {
  switch (state.activeView) {
    case "journals":
      return renderJournals(data);
    case "connectors":
      return renderConnectors(data);
    case "health":
      return renderHealth(data);
    case "activity":
      return renderActivity(data);
    case "overview":
    default:
      return renderOverview(data);
  }
}

function renderShell() {
  const meta = viewMeta[state.activeView];
  const data = state.data;
  const dataReady = data !== null;

  root.innerHTML = `
    <main class="dashboard-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <span class="sidebar__eyebrow">Asashiki</span>
          <strong>Private Admin</strong>
        </div>
        <nav class="sidebar__nav">
          ${renderNav()}
        </nav>
        <div class="sidebar__foot">
          <p>Milestone 3</p>
          <strong>Admin Dashboard MVP</strong>
        </div>
      </aside>
      <section class="workspace">
        <header class="workspace__header">
          <div>
            <p class="workspace__eyebrow">${meta.eyebrow}</p>
            <h1>${meta.label}</h1>
            <p class="workspace__description">${meta.description}</p>
          </div>
          <button id="refresh-button" class="ghost-button" type="button" ${state.loading ? "disabled" : ""}>Refresh</button>
        </header>
        ${
          state.notice
            ? `<section class="notice notice--success">${escapeHtml(state.notice)}</section>`
            : ""
        }
        ${
          state.error
            ? `<section class="notice notice--error">${escapeHtml(state.error)}</section>`
            : ""
        }
        ${
          state.loading
            ? `
              <section class="loading-state">
                <div class="loading-state__beam"></div>
                <p>Loading dashboard data...</p>
              </section>
            `
            : dataReady
              ? renderView(data)
              : `
                <section class="empty-state">
                  <h2>Waiting for Core API</h2>
                  <p>Start Core API and MCP Gateway, then reload this dashboard.</p>
                </section>
              `
        }
      </section>
    </main>
  `;

  attachInteractions();
}

function attachInteractions() {
  const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");

  refreshButton?.addEventListener("click", async () => {
    await refreshData();
  });

  const form = document.querySelector<HTMLFormElement>("#journal-form");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const content = String(formData.get("content") ?? "").trim();

    if (!content) {
      state.error = "Journal content 不能为空。";
      renderShell();
      return;
    }

    state.submitting = true;
    state.error = null;
    state.notice = null;
    renderShell();

    try {
      const response = await fetch(`${coreApiBaseUrl}/api/journals/drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: String(formData.get("title") ?? "").trim() || undefined,
          source: String(formData.get("source") ?? "admin-dashboard").trim(),
          content
        })
      });

      if (!response.ok) {
        throw new Error("创建 journal draft 失败。");
      }

      const saved = journalDraftSavedSchema.parse(await response.json());
      state.notice = `已创建 draft: ${saved.title}`;
      form.reset();
      await refreshData();
    } catch (error) {
      state.error =
        error instanceof Error ? error.message : "创建 journal draft 时发生未知错误。";
    } finally {
      state.submitting = false;
      renderShell();
    }
  });
}

async function refreshData() {
  state.loading = true;
  state.error = null;
  renderShell();

  try {
    state.data = await loadDashboardData();
  } catch (error) {
    state.data = null;
    state.error =
      error instanceof Error ? error.message : "加载仪表盘数据失败。";
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
