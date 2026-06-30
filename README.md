# Nuomi Switch

Nuomi Switch 是一个本地优先的桌面工具，用来管理 Codex 和 Claude 相关账号，并在需要时快速切换当前使用的本地配置。它基于 Tauri 2 构建，数据默认保存在当前设备，不依赖远程 Nuomi Switch 后端。

这个项目适合经常在多账号、多供应商或多套本地配置之间切换的开发者使用。目标是把手动编辑 `auth.json`、`config.toml`、Claude 配置和本地会话元数据这些容易出错的操作，收拢到一个更清晰、可确认、可恢复的桌面界面里。

## 下载

请在 GitHub Releases 下载对应系统的安装包：

[https://github.com/izz520/Nuomi-Switch/releases](https://github.com/izz520/Nuomi-Switch/releases)

常见安装包：

- macOS Apple Silicon：`aarch64.dmg`
- macOS Intel：`x64` / `x86_64` 相关 `.dmg`
- Windows：`.exe` 或 `.msi`
- Linux：`.deb`、`.rpm` 或 `.AppImage`

如果 macOS 首次打开提示来自未识别开发者，可以在系统设置的隐私与安全性中手动允许。正式代码签名和公证会在后续发布流程中继续完善。

### macOS 提示“已损坏，无法打开”

如果安装后看到：

```text
“Nuomi Switch”已损坏，无法打开。你应该将它移到废纸篓。
```

这通常是因为当前安装包还没有完成 Apple 开发者签名和公证，macOS Gatekeeper 给应用加上了隔离标记。确认安装包来自本项目 GitHub Releases 后，可以在终端执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Nuomi Switch.app"
```

然后重新打开应用即可。后续版本会继续完善 macOS 签名和公证流程。

## 主要功能

- 管理 Codex OAuth 和 API Key 账号。
- 从当前本地 `~/.codex/auth.json` 导入 Codex 账号。
- 从一个或多个 Codex 授权 JSON 文件批量导入账号。
- 支持粘贴 JSON、Token 字段、API Key、OAuth 浏览器登录等多种导入方式。
- 切换当前 Codex 授权文件，并在写入前确认。
- 切换前自动备份原始 `~/.codex/auth.json`。
- 刷新 OAuth 账号额度，失败时保留旧额度并标记为过期。
- 查看并修复本地 Codex 会话可见性。
- 管理 Claude Desktop 和 Claude CLI 账号。
- 支持 Claude OAuth、API Key、Desktop Gateway 等本地账号配置。
- 查看设置页中的本地路径、授权文件状态和软件版本。
- 手动检查新版本，并跳转到 GitHub Release 下载页。
- 查看已脱敏的本地日志。

## 本地优先与隐私

Nuomi Switch 不提供托管账号服务，也不需要远程 Nuomi Switch 后端。应用会读取和写入你本机上的 Codex / Claude 配置文件，并把自身数据保存在平台应用数据目录中。

请不要把真实 `auth.json`、Token、API Key、应用数据、备份或日志上传到 issue、pull request、聊天工具或公开仓库。日志页会尽量做脱敏展示，但分享任何文件前仍应自行检查。

更多说明见 [安全说明](./docs/security.md)。

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
claude-accounts.json
settings.json
backups/
logs/
batch-import-sessions/
```

设置页会显示当前机器检测到的实际路径。

## 开发环境

需要：

- Node.js 20 或更新版本
- pnpm
- Rust stable 工具链
- 当前操作系统所需的 Tauri 2 桌面依赖

检查工具链：

```bash
node --version
pnpm --version
rustc --version
cargo --version
```

安装依赖：

```bash
pnpm install
```

启动原生 Tauri 应用：

```bash
pnpm tauri:dev
```

仅调试 Web UI：

```bash
pnpm dev
```

## 构建

本地构建当前系统安装包：

```bash
pnpm tauri:build
```

构建产物通常位于：

```text
src-tauri/target/release/bundle/
```

项目已配置 GitHub Actions 发布工作流。推送 `v*` tag 后，会在 macOS、Windows 和 Linux 上分别构建安装包，并上传到 GitHub Draft Release。

```bash
git tag v0.2.1
git push origin v0.2.1
```

## 在线更新

新版本已接入 Tauri 官方 updater。应用会读取 GitHub Release 中由构建流程生成的 `latest.json`，校验更新包签名后在应用内下载、安装，并自动重启生效。

更新端点配置在 `src-tauri/tauri.conf.json`：

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/izz520/Nuomi-Switch/releases/latest/download/latest.json"]
    }
  }
}
```

签名密钥说明：

- updater 公钥已写入 `src-tauri/tauri.conf.json`。
- 本地生成的私钥位于 `.tauri-signing/nuomi-switch.key`，该目录已加入 `.gitignore`，不要提交到仓库。
- GitHub Actions 发布前需要配置仓库 Secret：`TAURI_SIGNING_PRIVATE_KEY`。值必须是 `.tauri-signing/nuomi-switch.key` 文件的一整行内容，可以用 `cat .tauri-signing/nuomi-switch.key` 复制；不要填 `.key.pub` 公钥内容，也不要填本地文件路径。当前私钥没有密码，`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 留空即可；如果以后重新生成了带密码的私钥，再配置对应密码。

发布新版本时，请同步更新：

- `package.json` 的 `version`
- `src-tauri/tauri.conf.json` 的 `version`
- 如需兼容旧版本客户端，再同步更新 `version.json` 的 `version` 和 `releaseUrl`

发布流程会创建 GitHub Draft Release，并上传安装包、签名文件和 updater 用的 `latest.json`。确认无误后发布该 draft，线上客户端才能检测到并安装更新。

`version.json` 仅保留给旧版本客户端使用；新版本客户端不再依赖 `VITE_UPDATE_MANIFEST_URL` 做更新判断。

## 验证

常用本地检查：

```bash
pnpm typecheck
pnpm build
pnpm smoke
```

Rust 检查：

```bash
cd src-tauri
cargo fmt --check
cargo check
cargo test
```

`pnpm smoke` 会在浏览器中运行 Playwright 烟雾测试，并 mock Tauri 命令；它不会启动原生 Tauri shell。

## 迁移与恢复

本地应用文件使用 `schemaVersion` 字段。若本地数据无法读取，Nuomi Switch 应报告结构化存储错误，而不是静默覆盖文件。

备份位置和恢复步骤见 [迁移与恢复](./docs/migration-and-recovery.md)。

## 故障排查

依赖安装、Playwright 浏览器、Rust PATH、OAuth 回调和本地数据问题见 [故障排查](./docs/troubleshooting.md)。

涉及真实私有凭据或原生桌面对话框的检查，请使用 [真实账号烟雾测试清单](./docs/real-account-smoke.md)。

## 当前限制

- OAuth 登录在 `1455` 端口可用时可以自动接收本地回调；手动回调 URL 字段会作为备用方案保留。
- 额度刷新仍需要更多真实账号环境验证。
- 批量导入预览支持选择后确认，但预览阶段的额度检查尚未完整实现。
- 暂未接入系统密钥存储；当前阶段凭据保存在本地应用数据 JSON 中。
- 在线更新使用 Tauri 签名安装包，安装后需要重启应用生效；不做远程 JS/CSS 热替换。
- Linux 支持仍需要更多发行版环境验证。

## 贡献

欢迎提交 issue 和 pull request。安全敏感报告请不要公开贴出真实凭据或日志，建议先脱敏后再描述问题。

Nuomi Switch 使用 MIT License 发布。
