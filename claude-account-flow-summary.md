# Claude Desktop / Claude CLI 账号添加与切换逻辑总结

本文基于项目 `/Users/yasol/Downloads/cockpit-tools-new` 当前代码整理，重点总结：

1. Claude Desktop 账号如何添加
2. Claude CLI 账号如何添加
3. Claude Desktop 账号如何切换
4. Claude CLI 账号如何切换

文中“Claude Desktop”主要指 `DesktopOAuth` 和 `DesktopGateway` 两类账号；“Claude CLI”主要指 Claude Code 本地 OAuth 登录态和 `ApiKey` 两类账号。

## 1. 总体架构

Claude 账号相关逻辑分成三层：

1. 前端页面：
   - `/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`
2. 前端服务封装：
   - `/Users/yasol/Downloads/cockpit-tools-new/src/services/claudeService.ts`
   - `/Users/yasol/Downloads/cockpit-tools-new/src/services/providerCurrentAccountService.ts`
3. Tauri / Rust 实现：
   - `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/commands/claude.rs`
   - `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/modules/claude_account.rs`
   - `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/modules/provider_current_state.rs`

核心原则有两个：

1. “添加账号”本质是把某种来源的登录态或配置，转成项目内部统一的 `ClaudeAccount` 并保存。
2. “切换账号”本质是把目标账号的真实本地状态重新注入 Claude Desktop 或 Claude Code 配置，再记录当前账号映射。

## 2. 当前账号状态如何记录

项目并不是只在前端记“当前账号”，而是持久化到：

- `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/modules/provider_current_state.rs`

它维护一个 `provider_current_accounts.json` 文件，保存 `platform -> accountId` 的映射。

Claude 使用两个独立槽位：

1. `claude_desktop_account`
   - 对应 `DesktopOAuth`
   - 对应 `DesktopGateway`
2. `claude_code_account`
   - 对应 Claude Code OAuth
   - 对应 `ApiKey`

前端在 `ClaudeAccountsPage.tsx` 中根据当前 tab 决定读取哪个槽位：

1. desktop tab -> `claude_desktop_account`
2. cli tab -> `claude_code_account`

## 3. Claude Desktop 账号添加逻辑

Claude Desktop 相关的添加方式主要有两种：

1. Desktop OAuth 登录导入
2. Desktop Gateway 配置导入

### 3.1 Desktop OAuth 添加流程

前端入口：

- `handleStartDesktopLogin`
- `handleCompleteDesktopLogin`
- 文件：`/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`

前端调用链：

1. `claudeService.claudeDesktopLoginStart(progressId)`
2. `claudeService.claudeDesktopLoginComplete(loginId, accountName)`

Tauri 命令：

1. `claude_desktop_login_start`
2. `claude_desktop_login_complete`

Rust 主逻辑：

1. `start_desktop_login(...)`
2. `complete_desktop_login(...)`

关键流程如下：

1. `start_desktop_login` 创建一个临时登录工作目录：
   - 位于项目数据目录下的 `claude_desktop_login/<login_id>`
2. 启动桌面认证辅助进程，把 Claude Desktop 指向这个临时 profile
3. 用户在这个隔离的 Desktop profile 中完成登录
4. `complete_desktop_login` 等待辅助进程导出登录结果
5. 将导出的登录态写回临时 profile 的 cookies / 本地数据
6. 调用 `import_desktop_profile_snapshot(...)`
7. 最终生成 `ClaudeAccount(auth_mode = DesktopOAuth)` 并保存

这类账号最关键的存储内容不是单个 token，而是一个桌面 profile 快照目录，核心字段包括：

1. `desktop_profile_dir`
2. `claude_credentials_raw`
3. `claude_config_raw`

其中 `desktop_profile_dir` 是之后切换 Desktop 账号时真正拿来恢复的快照来源。

### 3.2 Desktop OAuth 添加时保存了什么

Desktop OAuth 账号导入后，项目内部会保存：

1. 账号元信息
   - `id`
   - `email`
   - `account_uuid`
   - `organization_uuid`
   - `organization_name`
   - `plan_type`
2. Claude Desktop profile 快照目录路径
   - `desktop_profile_dir`
3. 从快照中解析出的配置和凭据快照
   - `claude_credentials_raw`
   - `claude_config_raw`
4. `last_used`、`created_at` 等索引信息

对于 Desktop OAuth，项目还带有去重逻辑：

- `save_desktop_account_with_dedupe(...)`

也就是说，如果识别成同一个桌面身份，可能不会新增一条，而是合并到已有账号。

### 3.3 Desktop Gateway 添加流程

前端入口：

- Desktop Gateway 添加表单
- 文件：`/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`

前端调用：

1. `claudeService.importClaudeDesktopGateway(...)`
2. 编辑时调用 `claudeService.updateClaudeDesktopGateway(...)`

Tauri 命令：

1. `import_claude_desktop_gateway`
2. `update_claude_desktop_gateway`

Rust 主逻辑：

1. `import_desktop_gateway(...)`
2. `update_desktop_gateway(...)`
3. 二者最终都走 `save_desktop_gateway(...)`

关键流程如下：

1. 校验 Gateway Base URL
2. 校验 API Key
3. 解析认证方式 `authScheme`
4. 解析 Gateway 模型配置
   - `direct` 模式
   - `local_mapping` 模式
5. 生成或复用 `desktop_gateway_config_id`
6. 构造 `ClaudeAccount(auth_mode = DesktopGateway)`
7. 保存到账号文件和索引

### 3.4 Desktop Gateway 添加时保存了什么

保存内容主要包括：

1. `api_key`
2. `api_base_url`
3. `api_provider_*`
4. `desktop_gateway_auth_scheme`
5. `desktop_gateway_credential_kind`
6. `desktop_gateway_config_id`
7. `desktop_gateway_models`
8. `desktop_gateway_connection_mode`
9. `desktop_gateway_upstream_models`
10. `desktop_gateway_model_mappings`
11. `claude_credentials_raw`
12. `claude_config_raw`

这类账号不依赖 `desktop_profile_dir`，而是依赖 Gateway 配置生成 Claude Desktop 的 3P 配置。

## 4. Claude CLI 账号添加逻辑

Claude CLI 相关的添加方式主要有三种：

1. 导入本机 Claude Code OAuth 登录态
2. 手动走 Claude OAuth 添加 CLI 账号
3. 录入 API Key 账号

### 4.1 从本机导入 Claude CLI 登录态

前端入口：

- `handleImportClaudeCliLocal`
- 文件：`/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`

前端调用：

1. `claudeService.importClaudeCliFromLocal()`

Tauri 命令：

1. `import_claude_cli_from_local`

Rust 主逻辑：

1. `import_cli_from_local()`

关键流程如下：

1. 读取 Claude Code 默认配置目录
2. 读取 credentials
   - 优先 macOS Keychain
   - 否则 `.credentials.json`
3. 检查里面是否有 `claudeAiOauth`
4. 读取全局配置 `.claude.json`
5. 检查是否包含 `oauthAccount`
6. 调 `upsert_account_from_snapshots(credentials_raw, config_raw)`
7. 生成或更新内部 `ClaudeAccount`

换句话说，这条线是“从本机现有 Claude Code 登录态反向收编到本工具”。

### 4.2 手动 Claude OAuth 添加 CLI 账号

前端入口：

1. `prepareOAuthLogin`
2. `handleOpenOAuthUrl`
3. `handleCompleteOAuth`

前端调用：

1. `claudeService.claudeOauthLoginPrepare()`
2. `claudeService.claudeOauthLoginComplete(loginId, callbackOrCode, emailHint)`

Tauri 命令：

1. `claude_oauth_login_prepare`
2. `claude_oauth_login_complete`

Rust 主逻辑：

1. `start_oauth_login()`
2. `complete_oauth_login(...)`

这条链的本质是：

1. 生成 OAuth 登录任务
2. 打开或展示授权地址
3. 用户完成网页授权
4. 粘贴回调地址或 code
5. 后端换取 token
6. 组装 `claude_credentials_raw` 和 `claude_config_raw`
7. 保存为 Claude Code 型账号

这类账号后续切换时不会恢复 Desktop profile，而是写回 Claude Code 的 credentials/config。

### 4.3 API Key 添加流程

前端入口：

- API Key 添加表单
- 文件：`/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`

前端调用：

1. `claudeService.importClaudeApiKey(...)`

Tauri 命令：

1. `import_claude_api_key`

Rust 主逻辑：

1. `import_api_key(...)`

关键流程如下：

1. 规范化 `api_base_url`
2. 判断是否必须是官方 Anthropic key
3. 规范化 API Key
4. 推导 provider 信息
5. 生成账号 id
6. 构造 `ClaudeAccount(auth_mode = ApiKey)`
7. 写入账号文件和索引

### 4.4 API Key 添加时保存了什么

保存内容主要包括：

1. `api_key`
2. `api_base_url`
3. `api_provider_id`
4. `api_provider_name`
5. `api_provider_source_tag`
6. `api_provider_website`
7. `api_provider_api_key_url`
8. `api_key_field`
9. `api_model_catalog`
10. `api_extra_env`
11. `claude_credentials_raw`
12. `claude_config_raw`

其中 `claude_credentials_raw` 和 `claude_config_raw` 会把这个 API Key 账号也包装成一套统一快照，便于导出、展示和后续注入。

## 5. Claude Desktop 切换逻辑

前端入口：

- `handleSwitch(account)`
- 文件：`/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`

前端调用：

1. `store.switchAccount(account.id)`
2. 底层调用 `claudeService.switchClaudeAccount(account.id)`

Tauri 命令：

1. `switch_claude_account`

Rust 主逻辑：

1. `commands/claude.rs::switch_claude_account(...)`
2. `claude_account::inject_to_claude(account_id)`
3. `claude_account::inject_to_claude_config(account_id, None)`

### 5.1 DesktopOAuth 切换流程

如果目标账号 `auth_mode == DesktopOAuth`，切换时会：

1. 读取该账号的 `desktop_profile_dir`
2. 定位 Claude Desktop 默认用户目录
   - 通常是 `~/Library/Application Support/Claude`
3. 退出 Claude Desktop
4. 备份当前默认用户目录
5. 恢复默认官方配置
6. 用该账号的 profile 快照覆盖默认用户目录
7. 再恢复一次官方配置
8. 更新账号 `last_used`
9. 启动 Claude Desktop
10. 将当前账号写入 `claude_desktop_account`

这说明 DesktopOAuth 切号的本质是“恢复整套本地桌面 profile”，而不是只替换一段 token。

### 5.2 DesktopOAuth 主要改动的文件

切号时重点恢复的是 Claude Desktop 用户目录里的这些项目：

1. `Local State`
2. `Preferences`
3. `Cookies`
4. `Cookies-journal`
5. `Network`
6. `DIPS`
7. `DIPS-wal`
8. `SharedStorage`
9. `SharedStorage-wal`
10. `WebStorage`
11. `Local Storage`
12. `IndexedDB`
13. `Session Storage`
14. `Service Worker`
15. `ant-did`
16. `config.json`
17. `claude_desktop_config.json`

其中最关键的是：

1. `Cookies`
2. `Local Storage`
3. `IndexedDB`
4. `Session Storage`

### 5.3 DesktopGateway 切换流程

如果目标账号 `auth_mode == DesktopGateway`，切换时会：

1. 退出 Claude Desktop
2. 向默认 Desktop profile 写入 Gateway 配置
3. 写入 `claude_desktop_config.json` 的部署模式
4. 写入 `Claude-3p/configLibrary`
5. 重新启动 Claude Desktop
6. 更新 `last_used`
7. 将当前账号写入 `claude_desktop_account`

这一类切换的重点不是恢复登录 cookie，而是切换 Claude Desktop 的 3P/Gateway 配置。

## 6. Claude CLI 切换逻辑

CLI 账号也走同一个 `switch_claude_account` 命令，但根据账号类型会落到不同分支。

### 6.1 Claude Code OAuth 切换流程

对于 Claude Code OAuth 类型账号，切换时会：

1. 解析目标 Claude Code 配置目录
2. 清理 API Key 型 env 注入
3. 从账号快照读取 `claude_credentials_raw`
4. 从账号快照读取 `claude_config_raw`
5. 将 `claudeAiOauth` 写回 credentials
   - macOS 优先写入 Keychain
   - 否则写入 `.credentials.json`
6. 将 `oauthAccount` 合并回全局配置 `.claude.json`
7. 更新 `last_used`
8. 将当前账号写入 `claude_code_account`

所以这条线的本质是“恢复 Claude Code 的 OAuth 凭据和全局配置”。

### 6.2 ApiKey 切换流程

对于 `ApiKey` 账号，切换时会：

1. 定位 Claude Code 配置目录
2. 读取 `settings.json`
3. 清掉项目此前管理过的 API env keys
4. 将目标账号对应的 env 写入 `settings.json`
5. 记录这次写入了哪些 managed keys
6. 更新 `last_used`
7. 将当前账号写入 `claude_code_account`

它主要写的环境变量包括：

1. `ANTHROPIC_API_KEY`
2. `ANTHROPIC_AUTH_TOKEN`
3. `ANTHROPIC_BASE_URL`
4. `ANTHROPIC_MODEL`
5. `ANTHROPIC_DEFAULT_HAIKU_MODEL`
6. `ANTHROPIC_DEFAULT_SONNET_MODEL`
7. `ANTHROPIC_DEFAULT_OPUS_MODEL`
8. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
9. `CLAUDE_CODE_ATTRIBUTION_HEADER`

对应文件主要是：

1. `settings.json`
2. `claude_cli_settings_managed_env_keys.json`

## 7. 切换完成后的统一动作

无论 Desktop 还是 CLI，切换完成后都会做这些统一动作：

1. 更新目标账号 `last_used`
2. 写 provider 当前账号状态
3. 更新 tray 菜单
4. 前端刷新当前账号高亮和成功提示

对应的当前账号槽位规则是：

1. `DesktopOAuth` / `DesktopGateway`
   - `claude_desktop_account`
2. 其他 Claude Code 型账号
   - `claude_code_account`

## 8. 一句话总结

### 8.1 Claude Desktop

添加账号：

1. DesktopOAuth：采集并保存一套 Claude Desktop profile 快照
2. DesktopGateway：保存一套 Gateway 配置参数

切换账号：

1. DesktopOAuth：把目标账号的桌面 profile 快照恢复到官方 Claude Desktop 用户目录
2. DesktopGateway：把目标账号的 Gateway 配置写入 Desktop 3P 配置目录

### 8.2 Claude CLI

添加账号：

1. CLI OAuth：采集或导入 Claude Code 的 credentials/config 快照
2. ApiKey：保存 API Key 和 provider 配置

切换账号：

1. CLI OAuth：把 credentials + `.claude.json` 恢复到 Claude Code 配置目录
2. ApiKey：把 env 写入 Claude Code `settings.json`

## 9. 关键源码位置

前端：

1. `/Users/yasol/Downloads/cockpit-tools-new/src/pages/ClaudeAccountsPage.tsx`
2. `/Users/yasol/Downloads/cockpit-tools-new/src/services/claudeService.ts`
3. `/Users/yasol/Downloads/cockpit-tools-new/src/services/providerCurrentAccountService.ts`

Tauri 命令：

1. `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/commands/claude.rs`
2. `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/commands/provider_current.rs`

核心实现：

1. `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/modules/claude_account.rs`
2. `/Users/yasol/Downloads/cockpit-tools-new/src-tauri/src/modules/provider_current_state.rs`

