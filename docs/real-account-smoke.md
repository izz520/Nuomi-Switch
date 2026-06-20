# 真实账号烟雾测试清单

只在你掌控 Codex 凭据的私有机器上使用这份清单。不要提交、上传或粘贴真实 Token、API Key、授权文件、应用数据、备份、包含秘密的截图，或未经检查的日志。

## 范围

这轮 smoke 验证 mock Web UI 测试无法证明的行为：

- 从当前本地 `~/.codex/auth.json` 导入账号。
- 从复制出来的授权 JSON 文件导入账号。
- 切换当前账号，并在需要时从备份恢复。
- 调用真实额度端点刷新额度。
- 通过手动回调 fallback 完成 OAuth token exchange。
- 在 `1455` 端口可用时，通过自动 localhost 回调完成 OAuth token exchange。
- 验证原生 Tauri shell 中的确认弹窗、打开目录和文件选择能力。

## 开始前

1. 备份当前 Codex 授权文件：

   ```bash
   cp ~/.codex/auth.json ~/.codex/auth.json.before-nuomi-switch-smoke
   ```

2. 启动原生应用：

   ```bash
   pnpm tauri:dev
   ```

3. 打开 `nuomi-switch/docs/security.md`，并把所有本地应用数据文件都视为敏感数据。

## 原生能力检查

- 打开设置页。
- 点击 `打开数据目录`。
- 点击 `打开日志`。
- 打开导入抽屉。
- 选择 JSON 文件导入，并确认原生文件选择器能打开。

期望结果：每个原生打开目录/对话框动作都能正常工作，没有 Tauri 权限错误。

## 导入检查

- 导入当前本地授权。
- 将 `~/.codex/auth.json` 复制到私有临时路径，并作为 JSON 文件导入。
- 确认重复导入在批量预览中显示为已存在。
- 使用一个之后可以删除的占位值导入合成 API Key 账号。

期望结果：有效账号只添加一次；重复项默认不被选中；失败文件不会阻断成功文件。

## 切换检查

- 选择一个非当前导入账号。
- 确认切换弹窗。
- 验证 `~/.codex/auth.json` 已变化。
- 验证 Nuomi Switch 的 `backups/` 目录下生成了备份文件。

期望结果：切换只会在确认后执行，并留下可恢复备份。

## 额度检查

- 选择一个 OAuth 账号。
- 点击 `刷新额度`。
- 记录小时和周额度是否更新。
- 如果可行，临时断网或使用过期账号后再次刷新。

期望结果：刷新成功会保存额度；刷新失败会保留旧值，并用可操作错误提示标记为旧数据。

## OAuth 检查

- 在导入抽屉选择 `OAuth 登录`。
- 开始登录。
- 在浏览器完成授权。
- 如果自动回调监听运行中，授权后返回 Nuomi Switch。
- 如果自动回调不可用，粘贴完整回调 URL 并提交回调。
- 确认导入。

期望结果：新 OAuth 账号被保存，UI 和日志中不暴露 Token。监听器无法绑定 `1455` 端口时，手动回调仍可使用。

## 结束后

1. 如有需要，恢复原授权文件：

   ```bash
   cp ~/.codex/auth.json.before-nuomi-switch-smoke ~/.codex/auth.json
   ```

2. 分享任何结果前先检查日志。
3. 只报告通过/失败、OS 版本、应用 commit/版本，以及已脱敏的错误码/错误消息。

不要把真实 `auth.json`、`accounts.json`、备份文件、OAuth 回调 URL、Token、API Key 或原始日志附加到公开 issue。
