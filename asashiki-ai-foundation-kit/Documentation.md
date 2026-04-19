# Documentation.md

## Current status

- Project phase: Milestone 8 first execution slice completed locally
- Active milestone: Milestone 8
- Code status: admin-web has been rebuilt into an admin-first console shell with profile editing, MCP test panels, and clearer Chinese-first page semantics
- Deployment status: VPS + domain + Claude MCP path verified; public-web remains local-preview only

## Decisions frozen so far

- Public web stays Cloudflare-first.
- VPS hosts the private core services.
- MCP is the external tool layer, not the whole system.
- First release is a Personal AI Control Plane MVP.
- First release excludes heavy memory platforms and full automation stacks.
- First release uses a small, explicit tool surface.
- Milestone 1 uses a `pnpm` monorepo rooted at the repository root.
- `asashiki-ai-foundation-kit/` remains the planning and documentation area.
- Shared contracts live in `packages/schemas`; shared service env parsing lives in `packages/config`.
- Public/Admin use Vite TypeScript shells; Core API and MCP Gateway use Fastify TypeScript shells.
- Milestone 2 adopts SQLite-first local persistence for the MVP.
- Milestone 3 keeps the Admin Dashboard framework-free and uses a multi-view vanilla TypeScript shell.
- Milestone 4 introduces a reusable public-status widget package for static frontends.
- Milestone 5 uses the official stable `@modelcontextprotocol/sdk` package for the first real MCP tool surface.
- Milestone 6 recommends Docker Compose as the default VPS deployment path and keeps PM2 as a fallback path.
- Milestone 7 keeps `public-web` out of formal production rollout and treats it as local-preview only.
- Milestone 8 prioritizes `admin-web` as the main operator surface and keeps complex connector onboarding Codex-managed first.

## MVP modules

- Core API
- MCP Gateway
- Admin Dashboard
- Public Status API
- Journal
- Connector Registry
- Health Snapshot
- Audit Log (minimal)

## Deferred to later phases

- Automatic long-term memory extraction
- Vector search / graph memory
- Dynamic proxying of arbitrary third-party MCPs
- Always-on browser automation
- Voice-first companion runtime
- Multi-agent orchestration

## Open questions

- SQLite implementation should remain `node:sqlite` or switch to a non-experimental package before deployment
- Admin auth: app-local auth vs Cloudflare Access first
- Public frontend framework choice
- MCP server implementation detail
- Health data ingestion path
- Admin remote deployment strategy should be finalized before first public release
- Public Web visual and data shape are still expected to iterate before any real Pages launch
- The first real external data-source pilot should be Supabase time logs rather than a more complex live health-data integration

## What to update during execution

After each milestone, append:

### Milestone X result
- Summary
- Files changed
- Validation run
- Problems found
- Decisions taken
- Next milestone readiness

## Milestone 1 result

- Summary
  - Bootstrapped a root-level monorepo with `apps/` and `packages/`.
  - Added shared schema and config packages reused by multiple apps.
  - Added minimal runnable shells for Public Web, Admin Web, Core API, and MCP Gateway.
  - Added root README, env templates, workspace config, and aggregate run scripts.
- Files changed
  - `README.md`
  - `.env.example`
  - `package.json`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - `tsconfig.json`
  - `apps/*`
  - `packages/*`
- Validation run
  - `pnpm install`
  - `pnpm build`
  - `pnpm typecheck`
  - aggregate startup verified by listening ports `3000,3001,4100,4200`
- Problems found
  - Initial `tsup` build flags for service apps were invalid and were corrected.
  - Frontend entry files needed explicit DOM root narrowing for TypeScript.
- Decisions taken
  - Keep the document kit untouched as planning SSOT and start implementation from repo root.
  - Use workspace-private source exports for shared packages during development.
  - Load Node service env values from workspace `.env` and local app `.env` files.
- Next milestone readiness
  - Milestone 2 can now add real data models and API routes on top of the scaffold without restructuring the repo.

## Milestone 2 result

- Summary
  - Added SQLite-backed Core API persistence for profile summary, journal drafts/entries, health snapshots, connectors, and audit events.
  - Implemented database initialization, seed scripts, API routes, and a reusable Fastify app factory.
  - Updated Admin Dashboard to read and render seeded Core API data.
  - Synced README and ops handbook with the new bootstrap and validation flow.
- Files changed
  - `apps/core-api/*`
  - `apps/admin-web/src/*`
  - `packages/schemas/src/index.ts`
  - `README.md`
  - `.env.example`
  - `package.json`
  - `asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
- Validation run
  - `pnpm install`
  - `pnpm db:init`
  - `pnpm db:seed`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm smoke`
- Problems found
  - Core API local persistence currently relies on Node 24 的 `node:sqlite`，运行时会出现 experimental warning。
- Decisions taken
  - Keep Milestone 2 storage SQLite-first and avoid introducing a heavier ORM before the data model is stable.
  - Enable Core API CORS so Public Web and Admin Web can read the same local API in development.
  - Keep journal writes inside Core API and log them into the audit table immediately.
- Next milestone readiness
  - Milestone 3 can build the Admin UI pages on top of the existing seeded endpoints without changing the backend storage shape.

## Milestone 3 result

- Summary
  - Rebuilt Admin Dashboard into a five-view private console: Overview, Journals, Connectors, Health, and Activity.
  - Added a journal draft creation form wired to the existing Core API write path.
  - Refined the dashboard visual language into an editorial control-room style instead of a generic admin grid.
  - Added local smoke validation for startup, Admin page response, and draft creation.
- Files changed
  - `apps/admin-web/src/main.ts`
  - `apps/admin-web/src/style.css`
  - `README.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
- Validation run
  - `pnpm build`
  - `pnpm typecheck`
  - local startup smoke with `dev:web` + `dev:services`
  - HTTP 200 confirmed for `http://127.0.0.1:3001`
  - journal draft POST succeeded during smoke
- Problems found
  - PowerShell `Invoke-WebRequest` parsing was unreliable in this environment, so smoke validation used `curl.exe` and `Invoke-RestMethod` instead.
- Decisions taken
  - Keep the Admin app as a vanilla Vite TypeScript SPA for now to avoid premature frontend framework expansion.
  - Use hash-based view switching so the MVP stays lightweight without router dependencies.
  - Keep journal creation inside the Journals view and rely on full data refresh after writes.
- Next milestone readiness
  - Milestone 4 can now focus on Public Status API and Public Web integration without needing more Admin restructuring.

## Milestone 4 result

- Summary
  - Tightened the public read model so Public Web only consumes non-sensitive cards and status messaging.
  - Added `packages/public-status-widget` as a reusable static frontend widget package.
  - Added `GET /public/widget-config` and a generated public API snapshot for integration reference.
  - Rebuilt Public Web to demonstrate both the live widget and its reusable config invocation.
- Files changed
  - `packages/public-status-widget/*`
  - `packages/schemas/src/index.ts`
  - `apps/public-web/*`
  - `apps/core-api/src/repository.ts`
  - `apps/core-api/src/app.ts`
  - `apps/core-api/src/cli/public-snapshot.ts`
  - `apps/core-api/snapshots/public-status.snapshot.json`
  - `README.md`
  - `asashiki-ai-foundation-kit/docs/03-module-boundaries.md`
  - `asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
  - `asashiki-ai-foundation-kit/docs/08-public-status-widget.md`
- Validation run
  - `pnpm install`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm public:snapshot`
  - local startup smoke with public page HTTP 200
  - `GET /public/status` succeeded
  - `GET /public/widget-config` succeeded
- Problems found
  - 无功能性阻塞；当前公开 snapshot 仍建立在 Node 24 的 experimental `node:sqlite` 之上。
- Decisions taken
  - Keep public cards strictly aggregate and descriptive, avoiding health detail or private journal signals.
  - Expose widget configuration separately so future static frontends can inspect and reuse it directly.
  - Keep Public Web as a demonstration shell over the reusable widget package, not the sole implementation.
- Next milestone readiness
  - Milestone 5 can now bind MCP Gateway to the existing Core API surface while Public Web stays on the narrow public contract.

## Milestone 5 result

- Summary
  - Replaced the placeholder MCP Gateway with a real MCP server over Streamable HTTP.
  - Added `get_recent_context` to Core API and exposed all five planned MCP tools through the gateway.
  - Added MCP test and smoke coverage that verify tool listing and successful tool calls.
  - Kept write actions routed through Core API so audit logging remains backend-owned.
- Files changed
  - `apps/core-api/src/app.ts`
  - `apps/core-api/src/repository.ts`
  - `packages/schemas/src/index.ts`
  - `apps/mcp-gateway/*`
  - `package.json`
  - `README.md`
  - `asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
- Validation run
  - `pnpm install`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm smoke`
- Problems found
  - MCP SDK split packages are still alpha on npm; implementation therefore uses the stable single-package `@modelcontextprotocol/sdk` path.
  - Runtime still inherits Node 24 `node:sqlite` experimental warning from Core API tests/smokes.
- Decisions taken
  - Use Streamable HTTP for the MVP MCP surface so local and future remote clients can share the same endpoint shape.
  - Add dynamic-port smoke coverage to avoid local port conflicts during validation.
  - Keep the gateway as a thin adapter layer and avoid duplicating business rules outside Core API.
- Next milestone readiness
  - Milestone 6 can now focus on deployment/runbook decisions with all four surfaces and the MCP tool layer already present.

## Milestone 6 result

- Summary
  - Added first-deploy documentation for Cloudflare Pages, VPS services, subdomain planning, and debugging paths.
  - Added executable deployment templates for Docker Compose, PM2, and Cloudflare Tunnel.
  - Added production environment templates for VPS services and static frontend builds.
  - Synced README, ops handbook, recommended stack, and research notes with the deployment conclusion.
  - Follow-up fix: corrected the Core API production build so bundled output keeps the `node:sqlite` import and can start from `dist/server.js`.
  - Follow-up fix: corrected the MCP Gateway production import paths so `node dist/server.js` can resolve the MCP SDK under Node ESM.
  - Follow-up fix: changed Docker Compose guidance to require `--env-file .env.production` so host port bindings and container env values come from the same source.
- Files changed
  - `.dockerignore`
  - `.env.production.example`
  - `apps/public-web/.env.production.example`
  - `apps/admin-web/.env.production.example`
  - `apps/core-api/package.json`
  - `apps/core-api/scripts/fix-node-sqlite.mjs`
  - `apps/mcp-gateway/package.json`
  - `infra/docker/*`
  - `infra/pm2/ecosystem.config.cjs`
  - `infra/cloudflare/tunnel.config.example.yml`
  - `README.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
  - `asashiki-ai-foundation-kit/docs/06-recommended-stack.md`
  - `asashiki-ai-foundation-kit/docs/07-research-notes.md`
  - `asashiki-ai-foundation-kit/docs/09-deployment-basics.md`
- Validation run
  - `pnpm build`
  - `pnpm typecheck`
  - direct `node dist/server.js` health check on Core API with a temporary database path
  - direct `node dist/server.js` health check on MCP Gateway with a temporary port
  - `node -e "require('./infra/pm2/ecosystem.config.cjs')"`
  - `pnpm smoke`
  - Docker Compose file reviewed statically; CLI validation was skipped because Docker is not installed in the current environment
- Problems found
  - `docker` CLI is not available in the current environment, so `docker compose config` could not be executed locally.
  - Runtime still inherits Node 24 `node:sqlite` experimental warning from Core API.
- Decisions taken
  - Keep public static hosting on Cloudflare Pages and private services on a single VPS.
  - Prefer Docker Compose for first deployment because it expresses two-service dependencies and SQLite persistence more clearly than PM2.
  - Treat remote Admin deployment as optional for the very first rollout so it does not block Public + Core + MCP go-live.
  - Keep the service bundle approach for now and patch the emitted `sqlite` import post-build instead of reworking the whole packaging pipeline.
  - Use `.js` suffixes only on MCP SDK wildcard subpaths such as `server/mcp.js` and `server/streamableHttp.js`, while keeping fixed-root exports such as `@modelcontextprotocol/sdk/client` unsuffixed.
  - Drive Compose interpolation with `docker compose --env-file .env.production` instead of relying on service-level `env_file` for host port binding.
- Next milestone readiness
  - The repository now has enough deployment/runbook material to enter hardening work such as auth finalization, storage stabilization, and release automation.

## Milestone 7 result

- Summary
  - Hardened deployment docs with the real NPM reverse-proxy lesson: bind host and Compose env loading must be checked before Cloudflare/NPM debugging.
  - Updated the production env example so NPM-mode binding defaults are explicit.
  - Added a known-good deployment flow, stop/rollback notes, and a Claude MCP smoke checklist.
  - Added `public-web` local preview flow and kept it explicitly out of formal production rollout.
- Files changed
  - `.env.production.example`
  - `apps/public-web/package.json`
  - `README.md`
  - `asashiki-ai-foundation-kit/Plan.md`
  - `asashiki-ai-foundation-kit/docs/05-ops-handbook.md`
  - `asashiki-ai-foundation-kit/docs/09-deployment-basics.md`
  - `asashiki-ai-foundation-kit/Documentation.md`
- Validation run
  - `pnpm --filter @asashiki/public-web build`
  - `pnpm --filter @asashiki/public-web dev`
  - `pnpm --filter @asashiki/public-web preview`
  - local HTTP checks for public-web dev and preview responses
- Problems found
  - Public Web is still iteration-stage and should not be treated as production-ready.
  - Runtime still inherits Node 24 `node:sqlite` experimental warning from Core API services.
- Decisions taken
  - Treat NPM reverse-proxy mode as the default documented VPS mode.
  - Require `docker compose --env-file .env.production` in all production examples.
  - Keep `public-web` in local preview only until UI and public data shape stabilize.
- Next milestone readiness
  - The repo is now ready for a narrower hardening phase instead of another architecture expansion.

## Milestone 8 planning note

- Summary
  - The next execution round should focus on `admin-web` rather than `public-web`.
  - MCP / connector onboarding remains Codex-managed first, with the UI focused on status, testing, and basic enable/disable controls.
  - The first real external connector pilot should be a Supabase time-log read path.
- Planned files
  - `asashiki-ai-foundation-kit/Plan.md`
  - `asashiki-ai-foundation-kit/docs/10-admin-first-execution-plan.md`
  - `README.md`
- Planned validation
  - admin local smoke
  - connector/MCP test-page smoke
  - Supabase pilot query smoke

## Milestone 8 result (slice 1)

- Summary
  - Rebuilt `admin-web` into a calmer admin-first control room with sidebar, top status strip, card-based content areas, and graceful partial-failure states.
  - Added profile editing through `PUT /api/profile/summary`, so core text data is no longer read-only seed data.
  - Added MCP helper endpoints for the control room: tool catalog plus per-tool smoke execution.
  - Added an MCP Tools view so current tools can be tested from the UI instead of only from terminal workflows.
- Follow-up refinement
  - Renamed the main views into clearer Chinese-first labels and reduced ambiguous English copy in the console shell.
  - Clarified that `连接中心` shows registered system connectors rather than live agent sessions.
  - Clarified that `工具测试` shows the five `mcp-gateway` tools and can run per-tool smoke checks.
  - Reframed the old Activity area into a troubleshooting-oriented `系统状态` page and added journal writing guidance.
- Files changed
  - `apps/admin-web/src/main.ts`
  - `apps/admin-web/src/style.css`
  - `apps/core-api/src/app.ts`
  - `apps/core-api/src/repository.ts`
  - `apps/core-api/src/core-api.test.ts`
  - `apps/mcp-gateway/src/app.ts`
  - `apps/mcp-gateway/src/mcp.ts`
  - `packages/schemas/src/index.ts`
  - `README.md`
  - `asashiki-ai-foundation-kit/docs/04-api-and-mcp-surface.md`
  - `asashiki-ai-foundation-kit/Documentation.md`
- Validation run
  - `pnpm --filter @asashiki/admin-web build`
  - `pnpm --filter @asashiki/admin-web typecheck`
  - `pnpm --filter @asashiki/core-api test`
  - `pnpm --filter @asashiki/mcp-gateway test`
- Problems found
  - The first real external connector pilot is still pending; current connector data remains the seeded registry.
  - Core API still uses Node 24 `node:sqlite`, so experimental warnings remain in service tests.
- Decisions taken
  - Keep the first Milestone 8 slice focused on operator usability rather than jumping straight to Supabase integration.
  - Let `admin-web` call dedicated helper endpoints for MCP smoke instead of trying to run browser-native Streamable HTTP sessions directly.
- Next milestone readiness
  - The next Milestone 8 slice can now focus on Connector Center deepening and the Supabase time-log pilot.
