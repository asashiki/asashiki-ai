# Infra 部署说明

## Docker 服务

```bash
cd /opt/apps/asashiki-ai/asashiki-ai
sudo docker compose -f infra/docker/compose.yaml --env-file .env.production up -d
```

**必须带 `--env-file .env.production`**：compose.yaml 的变量（MCP_PUBLIC_URL、各类
token）都从它注入。漏掉的话 gateway 会因 MCP_PUBLIC_URL 校验失败而崩溃循环重启
（2026-06-10 实测踩坑）。

## Cron 定时任务（宿主机，asashiki 用户）

**重要**：Crontab 运行在宿主机，与 Docker 无关，重新部署服务不会影响它。
但迁移服务器或重建用户时需要手动重新注册。

### 注册方法

以 asashiki 用户执行：

```bash
crontab -e
```

加入以下三行：

```
# Archive → GitHub（每天 04:00 UTC / 北京时间 12:00）
0 4 * * * /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/sync-archive.sh >> /home/asashiki/.local/log/archive-sync.log 2>&1

# DB 备份到 Archive（每周日 03:00 UTC / 北京时间 11:00）
0 3 * * 0 /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/backup-db.sh >> /home/asashiki/.local/log/asashiki-backup.log 2>&1

# 每日摘要 Markdown（每天 15:50 UTC / 北京时间 23:50）
50 15 * * * /opt/apps/asashiki-ai/asashiki-ai/infra/scripts/daily-digest.sh >> /home/asashiki/.local/log/asashiki-digest.log 2>&1
```

### 验证

```bash
crontab -l
ls ~/.local/log/
```

### 日志位置

| 任务 | 日志文件 |
|------|----------|
| Archive sync | `~/.local/log/archive-sync.log` |
| DB 备份 | `~/.local/log/asashiki-backup.log` |
| 每日摘要 | `~/.local/log/asashiki-digest.log` |

### 脚本说明

| 脚本 | 功能 |
|------|------|
| `scripts/sync-archive.sh` | 提交并推送 Asashiki_Archive 到 GitHub |
| `scripts/backup-db.sh` | 调用 `/api/admin/backup-db`，把 SQLite 文件复制到 Archive |
| `scripts/daily-digest.sh` | 调用 `/api/admin/daily-digest`，生成当天活动摘要 Markdown |

## 新增设备

在 `.env.production` 的 `DEVICE_TOKENS_JSON` 里追加一条，然后重启 core-api：

```bash
sudo docker compose -f infra/docker/compose.yaml up -d core-api
```
