# 迁移与恢复

本文说明 Nuomi Switch 如何存储本地数据，以及本地 JSON 文件损坏时如何恢复。

## 存储模型

Nuomi Switch 的应用数据存放在平台应用数据目录：

```text
macOS:   ~/Library/Application Support/nuomi-switch
Windows: %APPDATA%\nuomi-switch
Linux:   $XDG_DATA_HOME/nuomi-switch or ~/.local/share/nuomi-switch
```

最重要的文件和目录：

```text
accounts.json
settings.json
backups/
logs/
batch-import-sessions/
```

Codex 自身使用：

```text
~/.codex/auth.json
```

导入当前本地授权或切换当前账号时，Nuomi Switch 可能读取和写入该文件。

## schemaVersion

本地应用数据使用 `schemaVersion` 字段。当前第一阶段 schema 版本为：

```text
1.0.0
```

现阶段迁移策略保持保守。如果 `accounts.json` 或 `settings.json` 无法解析，Nuomi Switch 应报告结构化错误，而不是静默覆盖损坏文件。

## 备份位置

切换当前 Codex 账号前，Nuomi Switch 会把原 `~/.codex/auth.json` 备份到应用数据目录下的 `backups/`。

恢复时请同时关注这两个位置：

```text
Codex auth:       ~/.codex/auth.json
Nuomi Switch 数据: 平台应用数据目录/nuomi-switch
```

设置页会显示当前机器检测到的实际路径。

## 恢复 accounts.json

如果 Nuomi Switch 对 `accounts.json` 报告 `STORAGE_INVALID_FORMAT`：

1. 退出 Nuomi Switch。
2. 打开设置页显示的 Nuomi Switch 应用数据目录，或使用上文列出的平台路径。
3. 把 `accounts.json` 复制到安全的私有位置。
4. 将损坏文件重命名为 `accounts.json.broken`。
5. 重新启动 Nuomi Switch。
6. 从 `~/.codex/auth.json`、可信 JSON 文件、OAuth 登录、Token 字段或 API Key 字段重新导入账号。

寻求帮助时不要把真实 Token 或 API Key 粘贴到公开 issue。分享任何片段前都必须脱敏。

## 恢复 settings.json

如果 Nuomi Switch 对 `settings.json` 报告 `SETTINGS_INVALID_FORMAT`：

1. 退出 Nuomi Switch。
2. 把 `settings.json` 复制到安全的私有位置。
3. 将损坏文件重命名为 `settings.json.broken`。
4. 重新启动 Nuomi Switch。
5. 在设置页重新应用设置。

设置文件不是凭据配置，但分享前仍要检查，因为路径可能暴露本地用户名或项目名。

## 恢复 ~/.codex/auth.json

如果切换账号后 Codex 授权文件不可用：

1. 退出 Nuomi Switch 和所有可能读取 `~/.codex/auth.json` 的 Codex 进程。
2. 打开 Nuomi Switch 的 `backups/` 目录。
3. 找到失败切换前创建的最新备份。
4. 将备份复制回 `~/.codex/auth.json`。
5. 重启 Codex 或 Nuomi Switch，并确认当前账号可用。

如果没有备份，请通过 Codex 重新登录，或导入你自己掌控的可信授权 JSON。

## 公开 issue 指引

报告恢复问题时，请包含：

- 操作系统和版本。
- Nuomi Switch 版本。
- 错误码和错误消息。
- 受影响文件是 `accounts.json`、`settings.json` 还是 `~/.codex/auth.json`。
- 仅提供已脱敏日志。

不要附加真实 `auth.json`、`accounts.json`、Token、API Key、OAuth 回调 URL 或备份文件。
