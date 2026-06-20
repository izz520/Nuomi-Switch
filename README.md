# Nuomi Switch

Nuomi Switch 是一个轻量级本地桌面应用，用来管理和切换 Codex 账号。它专注于导入账号、切换当前 `~/.codex/auth.json`、查看额度、检查本地设置与日志，不依赖远程 Nuomi Switch 后端。

项目仍处于早期阶段，适合本地测试和小范围使用；公开发布前还需要更多真实环境验证。

## 功能

- 查看本地保存的 Codex 账号。
- 导入当前本地 `~/.codex/auth.json`。
- 从一个或多个 Codex 授权 JSON 文件导入账号。
- 批量导入前预览 JSON 文件结果，并选择要确认的项目。
- 从粘贴的 JSON 文本导入账号。
- 通过 Token 字段添加账号。
- 添加 API Key 账号，可配置显示名称和基础地址。
- 通过 OAuth 浏览器登录导入账号，支持 localhost 自动回调和手动粘贴回调 URL。
- 切换当前 Codex 授权文件，并在写入前弹出确认。
- 写入所选账号前备份原 `~/.codex/auth.json`。
- 刷新 OAuth 账号额度。
- 刷新失败时保留旧额度并标记为过期数据。
- 在设置页显示本地路径和授权文件状态。
- 在日志页查看已脱敏的本地日志。
- 使用带版本号的本地 JSON 存储应用数据。

## 技术栈

- Tauri 2
- Rust
- React
- TypeScript
- Vite
- Zustand
- pnpm

## 环境要求

- Node.js 20 或更新版本。
- pnpm。
- 带有 `rustc` 和 `cargo` 的 Rust 工具链。
- 当前操作系统所需的 Tauri 2 桌面依赖。

检查工具链：

```bash
node --version
pnpm --version
rustc --version
cargo --version
```

macOS 上如果已安装 Rust 但当前 shell 找不到 `cargo`，可以尝试：

```bash
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/opt/homebrew/opt/rustup/bin:$PATH"
```

## 平台依赖

Nuomi Switch 遵循 Tauri 2 的桌面依赖要求。

### macOS

- Xcode Command Line Tools。
- Rust stable 工具链。
- Node.js 和 pnpm。

如需安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### Windows

- Microsoft Visual Studio Build Tools，并安装 C++ 桌面开发工作负载。
- WebView2 runtime。
- Rust stable MSVC 工具链。
- Node.js 和 pnpm。

### Linux

Ubuntu 22.04 Docker 环境下，本地已验证 `.deb`、`.rpm` 和 `.AppImage` 打包。常见 Tauri 依赖包括 WebKitGTK、GTK、appindicator、librsvg、xdg-utils、rpm 以及构建工具包。构建前请以对应发行版包管理器和 Tauri 2 Linux 安装指南为准。

## 安装

在 `nuomi-switch` 目录下执行：

```bash
pnpm install
```

项目使用 `pnpm-lock.yaml` 维护依赖，请使用 pnpm 执行 JavaScript 依赖和脚本命令，不要使用 `npm install`。

## 本地运行

启动原生 Tauri 应用：

```bash
pnpm tauri:dev
```

也可以通过 pnpm 直接调用 Tauri CLI：

```bash
pnpm tauri dev
```

仅调试 Web UI：

```bash
pnpm dev
```

Vite 开发服务器使用 `1420` 端口，并启用 `strictPort: true`。

## 验证

常用本地检查：

```bash
pnpm typecheck
pnpm build
pnpm smoke
```

Rust 检查需要在 Tauri 项目目录执行：

```bash
cd src-tauri
cargo fmt --check
cargo check
cargo test
```

`pnpm smoke` 会在浏览器中运行 Playwright 烟雾测试，并 mock Tauri 命令；它不会启动原生 Tauri shell。

## 本地数据

Nuomi Switch 会读取和写入默认 Codex 授权文件：

```text
~/.codex/auth.json
```

Nuomi Switch 自身数据存放在平台应用数据目录下：

```text
macOS:   ~/Library/Application Support/nuomi-switch
Windows: %APPDATA%\nuomi-switch
Linux:   $XDG_DATA_HOME/nuomi-switch or ~/.local/share/nuomi-switch
```

重要文件和目录：

```text
accounts.json
settings.json
backups/
logs/
batch-import-sessions/
```

设置页会显示当前机器检测到的实际路径。

## 隐私边界

Nuomi Switch 是本地桌面应用，不提供托管账号服务，也不需要远程 Nuomi Switch 后端。

当前凭据材料保存在本地 JSON 文件中。应用展示的日志会尽量脱敏，但分享任何文件前仍应自行检查。不要把真实 `auth.json`、Token、API Key、应用数据、备份或日志上传到 issue、pull request、聊天工具或公开仓库。

详见 [安全说明](./docs/security.md)。

## 迁移与恢复

本地应用文件使用 `schemaVersion` 字段。若本地数据无法读取，Nuomi Switch 应报告结构化存储错误，而不是静默覆盖文件。

备份位置和恢复步骤见 [迁移与恢复](./docs/migration-and-recovery.md)。

## 故障排查

依赖安装、Playwright 浏览器、Rust PATH、OAuth 回调和本地数据问题见 [故障排查](./docs/troubleshooting.md)。

涉及真实私有凭据或原生桌面对话框的检查，请使用 [真实账号烟雾测试清单](./docs/real-account-smoke.md)。

## 贡献

提交 pull request 或 issue 前请阅读 [Contributing](../CONTRIBUTING.md)。安全敏感报告请遵循 [Security Policy](../SECURITY.md)。Nuomi Switch 使用 [MIT License](../LICENSE) 发布。

## 当前限制

- OAuth 登录在 `1455` 端口可用时可以自动接收本地回调；手动回调 URL 字段会作为备用方案保留。
- 额度刷新仍需要更多真实账号烟雾验证。
- 批量导入预览支持选择后确认，但预览阶段的额度检查尚未完整实现。
- 暂未接入系统密钥存储；当前阶段凭据保存在本地应用数据 JSON 中。
- macOS arm64 本地打包已验证，Ubuntu 22.04 Docker Linux 打包已验证。Windows 打包、GitHub release 运行和原生启动/对话框烟雾测试仍未验证。
- Linux 支持仍计划在公开发布阶段完善，发布前还需要验证 GitHub 托管产物。
