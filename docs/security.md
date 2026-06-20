# 安全说明

Nuomi Switch 会处理本地 Codex 凭据。请把所有账号文件、备份和日志都视为敏感数据。

## 当前边界

Nuomi Switch 是本地桌面应用，不提供托管账号服务，也不需要 Nuomi Switch 后端。

第一阶段的凭据存储是本地 JSON：

```text
Codex auth:       ~/.codex/auth.json
Nuomi Switch 数据: 平台应用数据目录/nuomi-switch/accounts.json
备份:              平台应用数据目录/nuomi-switch/backups
日志:              平台应用数据目录/nuomi-switch/logs
```

这些文件主要依赖本机操作系统账号权限保护。

## 不要分享的内容

不要把以下内容上传或粘贴到 GitHub issue、pull request、聊天工具、截图或公开日志中：

- 真实 `~/.codex/auth.json`。
- 真实 `accounts.json`。
- `backups/` 中的文件。
- 完整 API Key。
- OAuth access token、refresh token 或 ID token。
- Authorization header。
- OAuth 回调 URL 或 `code` 查询参数。
- 未经人工检查的日志。

如果需要分享片段，请用占位符替换敏感值，例如：

```text
[REDACTED_TOKEN]
[REDACTED_API_KEY]
[REDACTED_AUTHORIZATION]
[REDACTED_OAUTH_CODE]
```

## 日志与脱敏

Nuomi Switch 包含针对常见 Token、API Key、Authorization header 和 OAuth 回调参数的脱敏逻辑。脱敏只是安全防线之一，并不保证覆盖未来所有凭据格式。

分享日志前请人工检查。如果日志中出现完整 Token、API Key、Authorization header 或 OAuth code，请轮换受影响凭据，并把它视为发布阻断问题。

## 网络行为

使用 OAuth 登录或刷新额度时，Nuomi Switch 可能访问 Codex/OpenAI 端点。它不应把凭据发送到 Nuomi Switch 托管服务。

批量导入预览和本地账号管理应只处理本地文件。

## 密钥存储计划

当前第一阶段版本把凭据保存在本地 JSON 文件。更大范围公开发布前，计划评估系统级密钥存储：

- macOS Keychain。
- Windows Credential Manager。
- Linux Secret Service 兼容 keyring。

在完成实现和验证前，请假设任何能读取本地用户数据目录的人都能读取 Nuomi Switch 保存的凭据。

## 密钥存储评估

系统级密钥存储能增强安全性，但只要本地 JSON 边界足够明确，它不是第一阶段公开发布的硬性前置条件。

当前评估：

- macOS Keychain 能降低普通文件读取造成的暴露，但会增加既有 `accounts.json` 账号的迁移和恢复复杂度。
- Windows Credential Manager 需要在 Windows runner 或真实机器上单独验证，才能视为发布可用。
- Linux Secret Service 依赖用户会话 keyring，在精简桌面环境中可能不可用。
- 跨平台密钥存储需要迁移路径：读取现有 JSON 凭据、写入系统密钥库，并在密钥库锁定或不可用时干净恢复。

当前阶段决策：继续文档化并测试 JSON 存储。系统密钥存储作为后续加固任务，不作为静默 fallback。

## 报告安全问题

请不要在公开 issue 中包含可利用细节或真实凭据。有私有报告渠道时请优先使用；否则只在公开 issue 中描述高层影响，不附带秘密信息。

有用的报告信息：

- 操作系统。
- Nuomi Switch 版本或 commit。
- 受影响功能。
- 是否可能暴露真实凭据。
- 已脱敏的复现步骤。
