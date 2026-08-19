# Mimo

| 项目 | 说明 |
| --- | --- |
| 供应商 ID | mimo |
| 官网 | https://aistudio.xiaomimimo.com |
| API Base | https://aistudio.xiaomimimo.com |
| 认证 | Cookie |
| 凭据字段 | `service_token`, `user_id`, `ph_token` |

## 默认模型

| 显示名称 | 实际模型 ID |
| --- | --- |
| MiMo-V2.5-Pro | mimo-v2.5-pro |
| MiMo-V2.5 | mimo-v2.5 |
| MiMo-V2-Flash | mimo-v2-flash |

## 适配状态

已适配：流式对话、非流式对话、多轮会话、会话保存、标题生成、账号级清理对话记录、托管工具调用。

后续验证：官网 Cookie 字段、会话保存接口、模型 ID 升级。

## 教程

1. 登录 `aistudio.xiaomimimo.com`。
2. 打开 DevTools -> Network，在 MiMo Chat 中发送一句短消息。
3. 选中 `/open-apis/bot/chat` 请求，使用 Copy -> Copy as cURL。
4. 在供应商管理的 OAuth 登录页粘贴 cURL 并导入。当前官网使用 `xiaomichatbot_serviceToken`、`userId`、`xiaomichatbot_ph`，导入器也兼容旧的 `serviceToken` 名称。
5. MiMo 的认证 Cookie 无法被页面 JavaScript 稳定读取，因此不使用书签脚本导入。
6. 使用 `MiMo-V2.5-Pro` 作为首选验证模型。
