import {
  publicStatusCardSchema,
  publicStatusSchema,
  publicStatusWidgetConfigSchema
} from "@asashiki/schemas";
import type {
  PublicStatus,
  PublicStatusWidgetConfig
} from "@asashiki/schemas";

const STYLE_TAG_ID = "asashiki-public-status-widget-style";

const baseStyles = `
.public-status-widget {
  padding: 28px;
  border-radius: 28px;
  border: 1px solid rgba(60, 45, 34, 0.12);
  background:
    radial-gradient(circle at top right, rgba(160, 83, 48, 0.16), transparent 28%),
    linear-gradient(180deg, rgba(255, 250, 243, 0.96), rgba(245, 236, 224, 0.92));
  box-shadow: 0 28px 60px rgba(57, 36, 23, 0.12);
  color: #1e1814;
}

.public-status-widget--graphite-signal {
  background:
    radial-gradient(circle at top right, rgba(180, 128, 101, 0.16), transparent 28%),
    linear-gradient(180deg, rgba(31, 29, 28, 0.96), rgba(54, 46, 42, 0.96));
  color: #f7efe6;
  border-color: rgba(247, 239, 230, 0.12);
}

.public-status-widget__eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  color: inherit;
  opacity: 0.66;
}

.public-status-widget__title {
  margin: 0;
  font-family: "Palatino Linotype", Baskerville, Georgia, serif;
  font-size: clamp(1.8rem, 5vw, 3rem);
  line-height: 1;
}

.public-status-widget__subtitle {
  margin: 12px 0 0;
  max-width: 48rem;
  line-height: 1.6;
  opacity: 0.84;
}

.public-status-widget__status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 0;
  padding: 10px 14px;
  border-radius: 999px;
  font-size: 0.92rem;
  background: rgba(255, 255, 255, 0.42);
}

.public-status-widget--graphite-signal .public-status-widget__status {
  background: rgba(255, 255, 255, 0.08);
}

.public-status-widget__status::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
}

.public-status-widget__cards {
  margin: 20px 0 0;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.public-status-widget__card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.52);
  border: 1px solid rgba(60, 45, 34, 0.1);
}

.public-status-widget--graphite-signal .public-status-widget__card {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(247, 239, 230, 0.08);
}

.public-status-widget__card span {
  display: block;
  margin-bottom: 8px;
  font-size: 0.88rem;
  opacity: 0.72;
}

.public-status-widget__card strong {
  font-family: "Palatino Linotype", Baskerville, Georgia, serif;
  font-size: 1.4rem;
}

.public-status-widget__footer {
  margin-top: 16px;
  font-size: 0.88rem;
  opacity: 0.7;
}
`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createPublicStatusWidgetConfig(
  input: PublicStatusWidgetConfig
) {
  return publicStatusWidgetConfigSchema.parse(input);
}

export function ensurePublicStatusWidgetStyles() {
  if (document.getElementById(STYLE_TAG_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = baseStyles;
  document.head.append(style);
}

export function renderPublicStatusWidget(
  container: HTMLElement,
  config: PublicStatusWidgetConfig,
  status: PublicStatus
) {
  const safeConfig = publicStatusWidgetConfigSchema.parse(config);
  const safeStatus = publicStatusSchema.parse(status);
  const visibleCards = safeStatus.cards.slice(0, safeConfig.maxCards);

  container.className = `public-status-widget public-status-widget--${safeConfig.theme}`;
  container.innerHTML = `
    <p class="public-status-widget__eyebrow">${escapeHtml(safeConfig.docsLabel)}</p>
    <h2 class="public-status-widget__title">${escapeHtml(safeConfig.title)}</h2>
    <p class="public-status-widget__subtitle">${escapeHtml(safeConfig.subtitle)}</p>
    <div class="public-status-widget__status">${escapeHtml(safeStatus.message)}</div>
    <div class="public-status-widget__cards">
      ${visibleCards
        .map(
          (card) => `
            <article class="public-status-widget__card">
              <span>${escapeHtml(card.title)}</span>
              <strong>${escapeHtml(card.value)}</strong>
            </article>
          `
        )
        .join("")}
    </div>
    <p class="public-status-widget__footer">Updated ${escapeHtml(
      new Date(safeStatus.updatedAt).toLocaleString("zh-CN")
    )}</p>
  `;
}

export async function fetchPublicStatusWidgetData(
  config: PublicStatusWidgetConfig
) {
  const safeConfig = publicStatusWidgetConfigSchema.parse(config);
  const [statusResponse, cardsResponse] = await Promise.all([
    fetch(safeConfig.statusEndpoint),
    fetch(safeConfig.cardsEndpoint)
  ]);

  if (!statusResponse.ok) {
    throw new Error(`Failed to load ${safeConfig.statusEndpoint}`);
  }

  if (!cardsResponse.ok) {
    throw new Error(`Failed to load ${safeConfig.cardsEndpoint}`);
  }

  const status = publicStatusSchema.parse(await statusResponse.json());
  const cards = publicStatusCardSchema
    .array()
    .max(safeConfig.maxCards)
    .parse(await cardsResponse.json());

  return publicStatusSchema.parse({
    ...status,
    cards
  });
}

export async function mountPublicStatusWidget(
  container: HTMLElement,
  config: PublicStatusWidgetConfig
) {
  const safeConfig = publicStatusWidgetConfigSchema.parse(config);
  ensurePublicStatusWidgetStyles();

  const load = async () => {
    const status = await fetchPublicStatusWidgetData(safeConfig);
    renderPublicStatusWidget(container, safeConfig, status);
  };

  await load();

  const timer = window.setInterval(load, safeConfig.pollingIntervalMs);

  return {
    destroy() {
      window.clearInterval(timer);
    },
    reload: load
  };
}
