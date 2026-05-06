# Claude Code Instructions

Read and follow the repository instructions in AGENTS.md first.

This project is Asashiki AI / personal AI control plane.

Primary project directory:
/root/apps/asashiki-ai/asashiki-ai

Allowed external data directory:
/opt/asashiki/Asashiki_Archive

Rules:
- Use AGENTS.md as the main shared instruction file.
- You may modify files inside this repository.
- You may read and write Markdown notes inside /opt/asashiki/Asashiki_Archive only when explicitly asked.
- Do not modify /etc, /usr, /var, other /root projects, other /opt projects, Nginx Proxy Manager, Docker volumes, Cloudflare settings, or unrelated VPS services unless explicitly asked.
- Before changing Docker ports, docker-compose files, .env files, database schema, authentication, MCP protocol behavior, or deployment scripts, explain the plan first.
- Do not run destructive commands such as rm -rf, docker volume rm, docker system prune -a, database reset/drop/truncate, or deleting .env files.
- Before broad changes, run git status and explain the current branch and planned changes.
- After changes, summarize files changed, commands run, and remaining risks.
