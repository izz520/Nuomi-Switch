# Codex Auth、额度与 OAuth 调研

## 当前形态

- OAuth 授权文件会从 `tokens.idToken`、`tokens.accessToken`、可选 `tokens.refreshToken` 和可选 `tokens.accountId` 解析。
- API Key 授权文件会从 `OPENAI_API_KEY` 和可选 `baseUrl` 解析。
- OAuth 账号身份来自 ID token JWT payload，优先使用 `sub`，其次是 `accountId`，最后是 `email`。
- 额度刷新会使用 OAuth bearer access token 和可选 `ChatGPT-Account-Id` 调用 `https://chatgpt.com/backend-api/wham/usage`。
- OAuth 登录使用 PKCE，并支持手动粘贴回调 URL；也可以通过本地回调监听器自动接收回调。

## Fixture

- `fixtures/redacted-auth/oauth.json` 包含一个合成的未签名 JWT，只使用 fixture 邮箱和 subject。
- `fixtures/redacted-auth/api-key.json` 包含一个非真实 API Key，仅用于 parser 覆盖。
- `fixtures/redacted-auth/invalid-empty.json` 不包含可用凭据，必须在账号投影时失败。

这些 fixture 绝不能替换成真实 Token、refresh token、authorization code 或 API Key。

## T-019 添加的测试

- 脱敏覆盖 Token 字段、API Key 字段、Authorization header 和 OAuth 回调 `code` 查询参数。
- 授权解析覆盖 OAuth fixture、API Key fixture 和无效凭据结构。
- 额度测试覆盖响应解析和 HTTP 错误分类，不发起网络请求。
- OAuth 测试覆盖授权 URL 构造、query 解码、回调提取和缺少 code 的错误，不发起网络请求。

## 尚未覆盖

- 切换服务还没有独立单元测试，因为当前实现会通过 `dirs::home_dir()` 解析真实默认 `~/.codex/auth.json` 路径，并通过生产存储路径写入。可靠的切换测试应先引入可注入路径/存储边界，或使用能把 app data 和 home 目录固定到临时沙箱的集成测试 harness。
- 额度还没有用真实账号 smoke 测试，因为当前 workspace 不包含授权后的脱敏真实账号，且额度端点可能暴露账号特定状态。当前测试只验证解析和错误分类。
- OAuth token exchange 需要真实浏览器授权流和短生命周期 authorization code，因此仍需要真实环境 smoke；当前测试只验证本地 URL/回调处理。

## 后续验证步骤

1. 在拥有账号的本机导入一个已脱敏的真实 OAuth 账号。
2. 运行 `cargo test auth_file_service`，确认 fixture 解析仍然通过。
3. 启动应用，并使用一次性账号完成 OAuth 回调登录。
4. 刷新该 OAuth 账号额度，只记录状态类别、响应形态和已脱敏的错误码/响应片段。
5. 在测试切换备份/回滚行为前，先增加临时路径集成 harness。
6. 公开发布前重新运行 `cargo test` 和 `pnpm typecheck`。
