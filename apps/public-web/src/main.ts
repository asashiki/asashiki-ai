import { mountPublicStatusWidget } from "@asashiki/public-status-widget";
import { publicStatusWidgetConfig } from "./public-status.config";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const root = app;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell() {
  const configSnippet = `import { mountPublicStatusWidget } from "@asashiki/public-status-widget";
import { createPublicStatusWidgetConfig } from "@asashiki/public-status-widget";

const widget = await mountPublicStatusWidget(
  document.querySelector("#public-status")!,
  createPublicStatusWidgetConfig({
    component: "public-status-widget",
    title: "${publicStatusWidgetConfig.title}",
    subtitle: "${publicStatusWidgetConfig.subtitle}",
    statusEndpoint: "${publicStatusWidgetConfig.statusEndpoint}",
    cardsEndpoint: "${publicStatusWidgetConfig.cardsEndpoint}",
    pollingIntervalMs: ${publicStatusWidgetConfig.pollingIntervalMs},
    maxCards: ${publicStatusWidgetConfig.maxCards},
    theme: "${publicStatusWidgetConfig.theme}",
    emptyMessage: "${publicStatusWidgetConfig.emptyMessage}",
    docsLabel: "${publicStatusWidgetConfig.docsLabel}"
  })
);`;

  root.innerHTML = `
    <main class="public-shell">
      <section class="public-hero">
        <p class="public-hero__eyebrow">Cloudflare-first public surface</p>
        <h1>Public status is now a reusable static widget, not a one-off page.</h1>
        <p class="public-hero__lead">
          Milestone 4 makes the public read model easy to embed in any future static frontend by keeping the data surface small, documented, and config-driven.
        </p>
      </section>
      <section class="public-layout">
        <article class="public-panel">
          <div class="public-panel__header">
            <p>Live Widget</p>
            <h2>Public Status API</h2>
          </div>
          <div id="public-status-widget-target"></div>
        </article>
        <article class="public-panel public-panel--config">
          <div class="public-panel__header">
            <p>Reusable Config</p>
            <h2>Static Frontend Invocation</h2>
          </div>
          <ul class="config-list">
            <li><strong>Status endpoint</strong><span>${escapeHtml(publicStatusWidgetConfig.statusEndpoint)}</span></li>
            <li><strong>Cards endpoint</strong><span>${escapeHtml(publicStatusWidgetConfig.cardsEndpoint)}</span></li>
            <li><strong>Polling</strong><span>${publicStatusWidgetConfig.pollingIntervalMs}ms</span></li>
            <li><strong>Theme</strong><span>${escapeHtml(publicStatusWidgetConfig.theme)}</span></li>
          </ul>
          <pre class="config-code"><code>${escapeHtml(configSnippet)}</code></pre>
        </article>
      </section>
    </main>
  `;
}

async function boot() {
  renderShell();

  const target = document.querySelector<HTMLElement>(
    "#public-status-widget-target"
  );

  if (!target) {
    throw new Error("Public status widget target not found.");
  }

  try {
    await mountPublicStatusWidget(target, publicStatusWidgetConfig);
  } catch {
    target.innerHTML = `
      <div class="public-fallback">
        <strong>${escapeHtml(publicStatusWidgetConfig.emptyMessage)}</strong>
        <span>Check ${escapeHtml(publicStatusWidgetConfig.statusEndpoint)}</span>
      </div>
    `;
  }
}

void boot();
