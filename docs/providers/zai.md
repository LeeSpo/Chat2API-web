# Z.ai

| 项目 | 说明 |
| --- | --- |
| 供应商 ID | zai |
| 官网 | https://chat.z.ai |
| API Base | https://chat.z.ai/api |
| 认证 | JWT Token |
| 凭据字段 | `token`，可选 `captcha_verify_param` |
| 当前状态 | 可用；对话需要短时 `captcha_verify_param`，可通过 Qwen 同款浏览器 sidecar 静默生成 |

## 默认模型

| 显示名称 | 实际模型 ID |
| --- | --- |
| GLM-5.1 | GLM-5.1 |
| GLM-5-Turbo | GLM-5-Turbo |
| GLM-5V-Turbo | GLM-5v-Turbo |
| GLM-5 | glm-5 |
| GLM-4.7 | glm-4.7 |

## 适配状态

对话请求会带 `X-FE-Version`。默认回退值为 `prod-fe-1.1.88`，并会从 `https://chat.z.ai/` 页面解析当前前端版本后缓存约 1 小时。版本过期时上游返回「请刷新页面以更新应用后重试」，代理会把它转成 HTTP 409 / `frontend_version_outdated`，而不是伪装成模型回答。

账号检查只访问 `GET /api/v1/users/user/settings`，只说明 JWT 仍被用户接口接受，不能证明对话可用。

Z.ai 对 `/api/v2/chat/completions` 做前端验证码风控，但多数情况是**静默**的：页面加载阿里云 CaptchaJS，在屏幕外自动点隐藏按钮，把短时 `captcha_verify_param` 带进请求。本机网页上看不到滑块，不代表没有验证。

Chat2API 复用 Qwen 的 `qwen-browser` sidecar（或本机 Chrome）做同一件事：打开 `chat.z.ai`、注入 JWT、mint 参数，再由主进程发对话。参数只放内存，TTL 约 120 秒，不写回账号凭据。若阿里云弹出可见滑块，管理页账号菜单里的 **Server browser verification** 可以截图拖动。

没有浏览器时，上游仍会返回 `FRONTEND_CAPTCHA_REQUIRED` / `missing_param`，文案常常是「请刷新页面以更新应用后重试」，代理转成 HTTP 403 / `frontend_captcha_required`。浏览器可用但需要人拖时，返回 HTTP 503 / `zai_browser_verification_required`。

已完成的适配尝试：流式对话、非流式对话、多轮会话、账号级清理对话记录、GLM 系列模型映射、动态 `X-FE-Version`、`X-Region: domestic`、Aliyun 静默 mint、可见滑块时的管理页拖动。

无头 Chromium 仍可能被阿里云升成可见验证。那种情况需要在管理页拖一次，不能保证全自动。

## 教程

1. 登录 `chat.z.ai`。
2. 打开 DevTools -> Application，从 Local Storage 或 Cookies 复制 key 为 `token`、以 `eyJ` 开头的 JWT。
3. 在供应商管理中添加 Z.ai 账号，填入 `token`。
4. 「检查账号」通过只说明 JWT 有效，不代表对话一定成功。
5. Docker 部署请启用 `qwen-browser` sidecar，并设置 `CHAT2API_ZAI_BROWSER_MODE=sidecar`。
6. 若返回 `zai_browser_verification_required`，打开账号菜单里的 Server browser verification，在截图上拖动滑块后再重试。
7. `captcha_verify_param` 仅保留为调试字段；短时有效，不能当长期凭据。
