# Chat2API Web Docker 运维指南

本文档记录当前服务器的实际部署约定。命令默认在 `/home/ubuntu/project/chat2api` 执行。

## 当前架构

- 源码：`LeeSpo/Chat2API-web` 的 `dev` 分支
- 容器：`chat2api`
- 本地镜像：`chat2api-web:dev-local`
- API 与 Web 管理端：`http://127.0.0.1:8080/`
- OpenAI API：`http://127.0.0.1:8080/v1`
- LiteLLM 容器地址：`http://chat2api:8080/v1`
- 持久化卷：`chat2api-data`，容器内挂载到 `/data`
- LiteLLM 共享网络：`1panel-network`

服务不再运行 Electron、VNC 或 noVNC。8080 仅绑定宿主机回环地址；远程管理请使用 SSH 隧道：

```bash
ssh -L 8080:127.0.0.1:8080 user@server
```

然后在本机打开 `http://127.0.0.1:8080/`。

## 常用命令

```bash
cd /home/ubuntu/project/chat2api
docker compose ps
docker compose logs --tail=100 chat2api
docker compose logs -f chat2api
docker compose restart chat2api
docker stats --no-stream chat2api
curl http://127.0.0.1:8080/health
```

模型接口需要现有 Chat2API API Key。不要把真实 Key 写入仓库：

```bash
export CHAT2API_API_KEY='替换为实际值'
curl -H "Authorization: Bearer ${CHAT2API_API_KEY}" \
  http://127.0.0.1:8080/v1/models
```

## 本地环境配置

`.env` 被 Git 忽略，当前常用配置为：

```dotenv
CHAT2API_IMAGE=chat2api-web:dev-local
API_HOST_PORT=8080
CHAT2API_QWEN_AI_BROWSER_MODE=off
CHAT2API_ZAI_BROWSER_MODE=off
```

首次启动可在 Web 页面创建管理员密码。也可以在 `.env` 中设置长随机值：

```dotenv
CHAT2API_MANAGEMENT_SECRET=替换为长随机值
```

## LiteLLM

LiteLLM 保持以下上游地址：

```yaml
api_base: http://chat2api:8080/v1
```

当前 Web/Docker 版本使用 Node 网络栈，Perplexity 的原生 `Auto` 请求可能被 Cloudflare TLS 指纹校验拦截。为保留现有客户端使用的小写模型名，默认映射为：

```text
auto -> deepseek-v4-flash (DeepSeek)
```

大写 `Auto` 仍保留为 Perplexity 原生模型，但在 Docker 环境中不保证可用。

### MiMo Flash 兼容映射

小米已于 2026-06-30 停用旧的 `mimo-v2-flash` 路由。为避免现有 LiteLLM 和客户端配置失效，本项目仍公开 `MiMo-V2-Flash`，但会将它转发到 `mimo-v2.5`：

```text
MiMo-V2-Flash -> mimo-v2.5 (Mimo)
```

如果上游再次调整模型，需同步更新 `backend/providers/mimo/config.ts` 中的 `modelMappings` 和对应测试。

### DeepSeek 账户临时限制

DeepSeek 网页接口可能以 HTTP 200 返回 `user is muted` 业务错误。Chat2API 会将其转换为 HTTP 429 和 `deepseek_user_muted`，错误消息中包含上游给出的解除时间。该限制来自 DeepSeek 账户，不能通过重启容器解除；应等待解除、降低请求频率，或更换有效的 DeepSeek 账户。

检查容器网络：

```bash
docker exec litellm-proxy python -c \
  "import urllib.request; print(urllib.request.urlopen('http://chat2api:8080/health', timeout=5).read().decode())"
```

## 更新 dev 分支

更新前先备份数据：

```bash
mkdir -p /home/ubuntu/project/chat2api-backups
docker run --rm \
  -v chat2api-data:/data:ro \
  -v /home/ubuntu/project/chat2api-backups:/backup \
  alpine tar czf /backup/chat2api-data.tar.gz -C /data .
```

然后更新、构建并启动：

```bash
git pull --ff-only origin dev
docker compose build chat2api
docker compose up -d chat2api
docker compose ps
```

不要运行 `docker compose down -v`，否则会删除账号、API Key 和模型映射。

## 可选浏览器 Sidecar

默认关闭 Chromium sidecar，以减少 CPU 和内存占用。只有 Qwen AI 或 Z.ai 风控确实需要浏览器传输时，才在 `.env` 中启用：

```dotenv
COMPOSE_PROFILES=qwen-browser
CHAT2API_QWEN_AI_BROWSER_MODE=sidecar
CHAT2API_ZAI_BROWSER_MODE=sidecar
QWEN_AI_BROWSER_SIDECAR_SECRET=替换为长随机值
```

启用后执行：

```bash
docker compose --profile qwen-browser up -d --build
```

## 回滚

旧 Electron 部署保存在 `/home/ubuntu/project/chat2api-legacy-20260822`，切换前的数据备份位于：

```text
/home/ubuntu/project/chat2api-backups/chat2api-data-pre-web-20260822.tar.gz
```

如需回滚，先停止新容器，再恢复备份卷，最后从旧目录启动 Compose。恢复会覆盖当前数据，操作前应再次备份。

## 安全注意事项

- 不要提交 `.env`、API Key、管理员密码或供应商 Token。
- 不要直接把 8080 暴露到公网；公网访问应使用带 TLS 和访问控制的反向代理。
- 分享日志前先检查并清理认证头、Cookie 和上游 Token。
- 数据卷当前包含账号凭据，应限制 Docker 和宿主机备份目录的访问权限。
