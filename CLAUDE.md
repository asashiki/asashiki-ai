# Claude Code Instructions

Read and follow AGENTS.md first. AGENTS.md is the shared instruction file for both Codex and Claude Code.

Current project directory:
/opt/apps/asashiki-ai/asashiki-ai

Historical project directory:
/root/apps/asashiki-ai/asashiki-ai

Allowed external data directory:
/opt/asashiki/Asashiki_Archive

Migration context:
- This repository may have been moved from /root/apps/asashiki-ai/asashiki-ai to /opt/apps/asashiki-ai/asashiki-ai.
- Before changing deployment, Docker, scripts, or environment configuration, check whether any file still references the old /root/apps path.
- Do not assume the currently running Docker containers were started from this directory. Verify with docker inspect labels or docker compose ls first.

Rules:
- Use AGENTS.md as the main shared project rules.
- You may modify files inside this repository.
- You may read and write Markdown notes inside /opt/asashiki/Asashiki_Archive only when explicitly asked.
- Do not modify /etc, /usr, /var, /root, other /opt projects, Nginx Proxy Manager, Docker volumes, Cloudflare settings, or unrelated VPS services unless explicitly asked.
- Before changing Docker ports, docker-compose files, .env files, database schema, authentication, MCP protocol behavior, deployment scripts, or production services, explain the plan first.
- Do not run destructive commands such as rm -rf, docker volume rm, docker system prune -a, database reset/drop/truncate, or deleting .env files.
- Before broad changes, run git status and explain the current branch and planned changes.
- After changes, summarize files changed, commands run, and remaining risks.
