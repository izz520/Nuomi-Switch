# Nuomi Switch 故障排查

这份指南用于本地开发和小范围测试。公开发布打包仍在验证中。

## JavaScript 依赖

所有 JavaScript 命令都使用 `pnpm`：

```bash
pnpm install
```

如果 CI 或本地安装因为 frozen lockfile 失败，请更新 lockfile：

```bash
pnpm install
```

不要使用 `npm install`，它会为项目生成错误的 lockfile。

## Playwright 烟雾测试

烟雾测试运行在 Vite Web UI 上，并在浏览器里 mock Tauri 命令；不会启动原生 Tauri shell。

```bash
pnpm smoke
```

如果命令提示 `playwright: command not found`，请先安装依赖：

```bash
pnpm install
```

如果缺少浏览器，请安装 Playwright 使用的 Chromium：

```bash
pnpm exec playwright install chromium
```

## Rust 工具链

如果当前 shell 找不到 `cargo`，可以使用已安装的 stable 工具链路径：

```bash
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/opt/homebrew/opt/rustup/bin:$PATH" cargo check
```

Rust 验证需要在 Tauri 项目目录运行：

```bash
cd src-tauri
cargo check
cargo test
```

## Tauri 开发服务器

启动原生开发应用：

```bash
pnpm tauri:dev
```

仅调试 Web UI：

```bash
pnpm dev
```

Vite 服务器使用 `1420` 端口，并启用 `strictPort: true`。如果端口已被占用，请先停止占用进程再启动 Nuomi Switch。

## 平台依赖

如果原生构建或开发启动在窗口打开前失败，请优先检查 Tauri 平台依赖。

macOS：

```bash
xcode-select --install
```

Windows：

- 安装 Microsoft Visual Studio Build Tools，并选择 C++ 桌面开发工作负载。
- 安装或修复 WebView2 runtime。
- 使用 Rust MSVC 工具链。

Linux：

- Ubuntu 22.04 Docker 环境下已验证 `.deb`、`.rpm` 和 `.AppImage` 本地打包。
- 请为当前发行版安装 Tauri 2 所需的 WebKitGTK、GTK、appindicator、librsvg、xdg-utils、rpm 和构建工具包。

## OAuth 回调

Nuomi Switch 会尝试在 `127.0.0.1:1455` 接收 OAuth 浏览器回调。如果端口不可用，或浏览器没有返回应用，请使用手动回调字段：

1. 打开导入抽屉。
2. 选择 `OAuth 登录`。
3. 开始登录，并打开或复制授权链接。
4. 在浏览器完成授权。
5. 如果自动回调成功，返回 Nuomi Switch 并确认导入。
6. 如果自动回调不可用，把完整回调 URL 粘贴到 Nuomi Switch。
7. 提交回调并确认导入。

即使 `1455` 端口已被占用，也可以通过粘贴浏览器回调 URL 继续手动流程。

## 本地数据与日志

Nuomi Switch 默认在平台应用数据目录保存本地应用数据，并读取 `~/.codex/auth.json`。设置页会显示当前机器检测到的实际路径。

日志展示前应经过脱敏。如果日志里出现完整 Token、API Key、Authorization header 或 OAuth code，请视为发布阻断问题，并轮换受影响凭据。

如果 `accounts.json` 或 `settings.json` 损坏，请查看 [迁移与恢复](./migration-and-recovery.md)。删除任何文件前，请先做私有备份。

## 第一阶段已知缺口

- Playwright smoke 只覆盖 Web UI，不验证原生 Tauri 窗口行为。
- OAuth 和额度刷新仍需要真实脱敏账号烟雾验证。
- GitHub 托管 Linux 发布产物验证延后到公开 GitHub 阶段。
- 系统密钥存储不属于第一阶段小范围发布内容。
