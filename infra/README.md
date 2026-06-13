# Infra 部署说明

## Docker 服务

```bash
cd /opt/apps/asashiki-ai/asashiki-ai
sudo docker compose -f infra/docker/compose.yaml --env-file .env.production up -d
```

**必须带 `--env-file .env.production`**：compose.yaml 的变量（MCP_PUBLIC_URL、各类
token）都从它注入。漏掉的话 gateway 会因 MCP_PUBLIC_URL 校验失败而崩溃循环重启
（2026-06-10 实测踩坑）。

## Cron 定时任务

已于 2026-06-13 全部移除（Archive 归档废弃，备份改由其他端处理）。原本的
`sync-archive.sh` / `backup-db.sh` / `daily-digest.sh` 脚本及对应的
`/api/admin/backup-db`、`/api/admin/daily-digest` 端点均已删除。

## 新增设备

在 `.env.production` 的 `DEVICE_TOKENS_JSON` 里追加一条，然后重启 core-api：

```bash
sudo docker compose -f infra/docker/compose.yaml up -d core-api
```
