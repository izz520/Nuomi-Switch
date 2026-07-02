import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileJson,
  Fingerprint,
  FolderOpen,
  KeyRound,
  LockKeyhole,
  TextCursorInput,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { useCodexAccountsStore } from '../../stores/useCodexAccountsStore';
import { type ImportSource, useImportFlowStore } from '../../stores/useImportFlowStore';
import { previewChatGPTSessionText } from '../../services/chatgptSessionImport';
import { isOAuthAuthMode, type CodexAccountView } from '../../types/codex';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { IconButton } from '../ui/IconButton';
import { BatchImportPreviewTable } from './BatchImportPreviewTable';
import './ImportDrawer.css';

interface ImportSourceOption {
  id: ImportSource;
  label: string;
  description: string;
  icon: ReactNode;
}

const importSources: ImportSourceOption[] = [
  {
    id: 'oauth',
    label: 'OAuth 登录',
    description: '浏览器登录并回调',
    icon: <LockKeyhole size={16} />,
  },
  {
    id: 'apiKey',
    label: 'API Key',
    description: '添加 API Key 账号',
    icon: <KeyRound size={16} />,
  },
  {
    id: 'session',
    label: 'Session',
    description: '粘贴 ChatGPT session JSON',
    icon: <Fingerprint size={16} />,
  },
  {
    id: 'local',
    label: '当前本地授权',
    description: '使用 ~/.codex/auth.json',
    icon: <FolderOpen size={15} />,
  },
  {
    id: 'jsonFile',
    label: 'JSON 文件',
    description: '选择一个授权 JSON 文件',
    icon: <FileJson size={16} />,
  },
  {
    id: 'jsonText',
    label: 'JSON 文本',
    description: '粘贴授权 JSON 内容',
    icon: <TextCursorInput size={16} />,
  },
];

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function jsonTextPreview(jsonText: string): string {
  const trimmed = jsonText.trim();
  if (trimmed.length === 0) {
    return '还没有粘贴 JSON 内容。';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return `${parsed.length} 个账号导出项可导入。`;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return 'JSON 必须是对象或数组。';
    }
    const record = parsed as Record<string, unknown>;
    if (record.type === 'sub2api-data' && Array.isArray(record.accounts)) {
      return `${record.accounts.length} 个 sub2api 账号可导入。`;
    }
    if (
      typeof record.id_token === 'string' ||
      typeof record.idToken === 'string' ||
      typeof record.access_token === 'string' ||
      typeof record.accessToken === 'string'
    ) {
      return 'CPA token 导出内容可导入。';
    }
    const keys = Object.keys(record).slice(0, 5);
    return keys.length > 0 ? `对象字段：${keys.join(', ')}` : '有效的空 JSON 对象。';
  } catch {
    return '导入前会检查 JSON。';
  }
}

function accountSubtitle(account: CodexAccountView): string {
  return account.email ?? account.accountId ?? account.userId ?? account.id;
}

function formatExpiresAt(expiresAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(expiresAt * 1000));
}

export function ImportDrawer() {
  const {
    open,
    closeDrawer,
    source,
    setSource,
    importing,
    selectingFiles,
    previewingBatch,
    jsonText,
    sessionText,
    filePaths,
    batchPreview,
    batchSelectedItemIds,
    tokenFields,
    apiKeyFields,
    oauth,
    resultAccounts,
    failedImports,
    error,
    setJsonText,
    setSessionText,
    setTokenField,
    setApiKeyField,
    setOAuthCallbackUrl,
    startOAuthLogin,
    submitOAuthCallbackUrl,
    pollOAuthLoginStatus,
    cancelOAuthLogin,
    chooseFiles,
    clearFiles,
    toggleBatchItem,
    setAllBatchItemsSelected,
    importSelected,
  } = useImportFlowStore();
  const upsertAccounts = useCodexAccountsStore((state) => state.upsertAccounts);
  const refreshAccountQuota = useCodexAccountsStore((state) => state.refreshAccountQuota);

  const confirmDisabled = useMemo(() => {
    if (importing || selectingFiles || oauth.starting || oauth.submittingCallback || oauth.cancelling) {
      return true;
    }
    if (source === 'jsonFile' || source === 'batchFiles') {
      if (filePaths.length === 0 || previewingBatch) {
        return true;
      }
      return batchPreview !== null && batchSelectedItemIds.length === 0;
    }
    if (source === 'jsonText') {
      return jsonText.trim().length === 0;
    }
    if (source === 'session') {
      return sessionText.trim().length === 0;
    }
    if (source === 'token') {
      return tokenFields.idToken.trim().length === 0 || tokenFields.accessToken.trim().length === 0;
    }
    if (source === 'apiKey') {
      return apiKeyFields.apiKey.trim().length === 0;
    }
    if (source === 'oauth') {
      return oauth.login === null || oauth.step !== 'callbackSubmitted';
    }
    return false;
  }, [
    apiKeyFields.apiKey,
    filePaths.length,
    importing,
    jsonText,
    oauth.cancelling,
    oauth.login,
    oauth.starting,
    oauth.step,
    oauth.submittingCallback,
    previewingBatch,
    selectingFiles,
    sessionText,
    source,
    batchPreview,
    batchSelectedItemIds.length,
    tokenFields.accessToken,
    tokenFields.idToken,
  ]);

  function finalizeSuccessfulAdd(accounts: CodexAccountView[]) {
    upsertAccounts(accounts);
    if (open) {
      closeDrawer();
    }
    for (const account of accounts) {
      if (isOAuthAuthMode(account.authMode) && !account.isPatOnly) {
        void refreshAccountQuota(account.id);
      }
    }
  }

  async function handleImport() {
    const result = await importSelected();
    if (result) {
      if (result.imported.length > 0 && result.failed.length === 0) {
        finalizeSuccessfulAdd(result.imported);
      } else {
        upsertAccounts(result.imported);
      }
    }
  }

  useEffect(() => {
    if (!open || source !== 'oauth' || !oauth.login || oauth.step !== 'started' || importing) {
      return undefined;
    }

    let cancelled = false;
    async function poll() {
      const result = await pollOAuthLoginStatus();
      if (!cancelled && result && result.imported.length > 0) {
        finalizeSuccessfulAdd(result.imported);
      }
    }

    const interval = window.setInterval(() => {
      void poll();
    }, 1000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [importing, oauth.login, oauth.step, open, pollOAuthLoginStatus, source]);

  useEffect(() => {
    if (open && source === 'oauth' && oauth.step === 'completed' && resultAccounts.length > 0) {
      finalizeSuccessfulAdd(resultAccounts);
    }
  }, [oauth.step, open, resultAccounts, source]);

  if (!open) {
    return null;
  }

  const selectedSource = importSources.find((item) => item.id === source) ?? importSources[0];

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="import-drawer" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="drawer-header">
          <h2 id="import-title">添加 Codex 账号</h2>
          <IconButton label="关闭添加账号抽屉" icon={<X size={16} />} onClick={closeDrawer} />
        </header>

        <div className="drawer-body">
          <section
            aria-labelledby={`import-source-tab-${source}`}
            className="import-workspace"
            id={`import-panel-${source}`}
            role="tabpanel"
          >
            <div className="codex-source-tabs" role="tablist" aria-label="账号来源">
              {importSources.map((item) => (
                <button
                  aria-controls={`import-panel-${item.id}`}
                  aria-label={item.label}
                  aria-selected={source === item.id}
                  className={`codex-source-tab ${source === item.id ? 'active' : ''}`}
                  id={`import-source-tab-${item.id}`}
                  key={item.id}
                  role="tab"
                  title={item.description}
                  type="button"
                  onClick={() => setSource(item.id)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {error ? <ErrorBanner error={error} /> : null}

            <div className="source-summary">
              <span className="source-summary-icon" aria-hidden="true">
                {selectedSource.icon}
              </span>
              <div>
                <h3>{selectedSource.label}</h3>
                <p>{selectedSource.description}</p>
              </div>
            </div>

            <div className="import-form-area">
              {source === 'local' ? (
                <div className="local-auth-panel">
                  <span>Nuomi Switch 会读取当前本地授权文件，并添加到本地账号列表。</span>
                  <code>~/.codex/auth.json</code>
                </div>
              ) : null}

              {source === 'jsonFile' || source === 'batchFiles' ? (
                <div className="import-field-group">
                  <div className="file-actions">
                    <Button variant="secondary" loading={selectingFiles} icon={<FileJson size={16} />} onClick={chooseFiles}>
                      选择 JSON
                    </Button>
                    {filePaths.length > 0 ? (
                      <Button variant="ghost" onClick={clearFiles}>
                        清空
                      </Button>
                    ) : null}
                  </div>
                  {filePaths.length === 0 ? (
                    <p className="muted">选择一个或多个 Codex 授权 JSON 文件。</p>
                  ) : (
                    <ul className="file-preview-list" aria-label="已选择的导入文件">
                      {filePaths.map((filePath) => (
                        <li key={filePath}>
                          <strong>{fileName(filePath)}</strong>
                          <span>{filePath}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {previewingBatch ? <p className="muted">正在准备批量预览...</p> : null}
                </div>
              ) : null}

              {source === 'jsonText' ? (
                <label className="import-field">
                  <span>授权 JSON</span>
                  <textarea
                    rows={9}
                    spellCheck={false}
                    value={jsonText}
                    placeholder='{"auth_mode":"oauth","tokens":{...}} or [{"id_token":"..."}] or {"type":"sub2api-data","accounts":[...]}'
                    onChange={(event) => setJsonText(event.target.value)}
                  />
                </label>
              ) : null}

              {source === 'session' ? (
                <div className="import-field-group">
                  <div className="session-import-guide">
                    <strong>ChatGPT Session</strong>
                    <p>
                      先在浏览器登录 ChatGPT，然后打开{' '}
                      <a href="https://chatgpt.com/api/auth/session" target="_blank" rel="noreferrer">
                        https://chatgpt.com/api/auth/session
                      </a>
                      ，复制整段 JSON。
                    </p>
                    <p>Session 通常没有 refresh_token，导入后 access token 过期就需要重新导入或改用 OAuth 登录。</p>
                  </div>
                  <label className="import-field">
                    <span>Session JSON</span>
                    <textarea
                      rows={10}
                      spellCheck={false}
                      value={sessionText}
                      placeholder='{"user":{"email":"mark@example.com"},"expires":"2026-08-06T14:29:36.155Z","account":{"id":"...","planType":"plus"},"accessToken":"...","sessionToken":"..."}'
                      onChange={(event) => setSessionText(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {source === 'token' ? (
                <div className="import-field-group">
                  <label className="import-field">
                    <span>ID token</span>
                    <textarea
                      rows={3}
                      spellCheck={false}
                      value={tokenFields.idToken}
                      placeholder="粘贴 id_token"
                      onChange={(event) => setTokenField('idToken', event.target.value)}
                    />
                  </label>
                  <label className="import-field">
                    <span>Access token</span>
                    <textarea
                      rows={3}
                      spellCheck={false}
                      value={tokenFields.accessToken}
                      placeholder="粘贴 access_token"
                      onChange={(event) => setTokenField('accessToken', event.target.value)}
                    />
                  </label>
                  <label className="import-field">
                    <span>Refresh token</span>
                    <input
                      value={tokenFields.refreshToken}
                      placeholder="可选"
                      onChange={(event) => setTokenField('refreshToken', event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {source === 'apiKey' ? (
                <div className="import-field-group">
                  <label className="import-field">
                    <span>API Key</span>
                    <input
                      value={apiKeyFields.apiKey}
                      placeholder="sk-..."
                      onChange={(event) => setApiKeyField('apiKey', event.target.value)}
                    />
                  </label>
                  <label className="import-field">
                    <span>显示名称</span>
                    <input
                      value={apiKeyFields.displayName}
                      placeholder="可选"
                      onChange={(event) => setApiKeyField('displayName', event.target.value)}
                    />
                  </label>
                  <label className="import-field">
                    <span>API 基础地址</span>
                    <input
                      value={apiKeyFields.apiBaseUrl}
                      placeholder="可选，例如 https://api.openai.com/v1"
                      onChange={(event) => setApiKeyField('apiBaseUrl', event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {source === 'oauth' ? (
                <OAuthLoginPanel
                  callbackUrl={oauth.callbackUrl}
                  cancelling={oauth.cancelling}
                  login={oauth.login}
                  portInUse={oauth.portInUse}
                  starting={oauth.starting}
                  step={oauth.step}
                  submittingCallback={oauth.submittingCallback}
                  onCancel={cancelOAuthLogin}
                  onCallbackUrlChange={setOAuthCallbackUrl}
                  onStart={startOAuthLogin}
                  onSubmitCallback={submitOAuthCallbackUrl}
                />
              ) : null}
            </div>

            <section className="drawer-preview" aria-labelledby="import-preview-title">
              <h3 id="import-preview-title">导入预览</h3>
              {resultAccounts.length === 0 && failedImports.length === 0 ? (
                  <PreviewHint source={source} jsonText={jsonText} sessionText={sessionText} filePaths={filePaths} />
              ) : null}
              {resultAccounts.length > 0 || failedImports.length > 0 ? (
                <p className="import-summary">
                  已添加 {resultAccounts.length} 个，失败 {failedImports.length} 个
                </p>
              ) : null}
              {batchPreview ? (
                <BatchImportPreviewTable
                  items={batchPreview.items}
                  selectedItemIds={batchSelectedItemIds}
                  onToggleAll={setAllBatchItemsSelected}
                  onToggleItem={toggleBatchItem}
                />
              ) : null}
              {resultAccounts.length > 0 ? (
                <ul className="import-result-list" aria-label="已添加账号">
                  {resultAccounts.map((account) => (
                    <li key={account.id}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <span>
                        <strong>{account.displayName}</strong>
                        <small>{accountSubtitle(account)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {failedImports.length > 0 ? (
                <ul className="import-failure-list" aria-label="导入失败">
                  {failedImports.map((failure) => (
                    <li key={`${failure.source}-${failure.error}`}>
                      <strong>{fileName(failure.source)}</strong>
                      <span>{failure.error}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </section>
        </div>

        <footer className="drawer-footer">
          <Button variant="ghost" onClick={closeDrawer}>
            取消
          </Button>
          <Button variant="primary" loading={importing} disabled={confirmDisabled} onClick={handleImport}>
            添加账号
          </Button>
        </footer>
      </aside>
    </div>
  );
}

interface PreviewHintProps {
  source: ImportSource;
  jsonText: string;
  sessionText: string;
  filePaths: string[];
}

function PreviewHint({ source, jsonText, sessionText, filePaths }: PreviewHintProps) {
  if (source === 'jsonText') {
    return <p className="muted">{jsonTextPreview(jsonText)}</p>;
  }

  if (source === 'session') {
    return <p className="muted">{previewChatGPTSessionText(sessionText)}</p>;
  }

  if (source === 'jsonFile' || source === 'batchFiles') {
    return <p className="muted">{filePaths.length > 0 ? `${filePaths.length} 个文件可导入。` : '还没有选择文件。'}</p>;
  }

  if (source === 'token') {
    return <p className="muted">保存账号前会在本地校验 Token。</p>;
  }

  if (source === 'apiKey') {
    return <p className="muted">确认后会把 API Key 保存为 Codex API Key 账号。</p>;
  }

  if (source === 'oauth') {
    return <p className="muted">开始登录并在浏览器完成授权，Nuomi Switch 会自动添加账号。</p>;
  }

  return <p className="muted">已准备好添加当前本地 Codex 授权。</p>;
}

interface OAuthLoginPanelProps {
  callbackUrl: string;
  cancelling: boolean;
  login: {
    loginId: string;
    authUrl: string;
    redirectUri: string;
    expiresAt: number;
    listenerStarted: boolean;
    listenerError?: string | null;
  } | null;
  portInUse: boolean | null;
  starting: boolean;
  step: string;
  submittingCallback: boolean;
  onCancel: () => Promise<void>;
  onCallbackUrlChange: (callbackUrl: string) => void;
  onStart: () => Promise<void>;
  onSubmitCallback: () => Promise<void>;
}

function OAuthLoginPanel({
  callbackUrl,
  cancelling,
  login,
  portInUse,
  starting,
  step,
  submittingCallback,
  onCancel,
  onCallbackUrlChange,
  onStart,
  onSubmitCallback,
}: OAuthLoginPanelProps) {
  const canSubmitCallback = login !== null && callbackUrl.trim().length > 0 && step !== 'callbackSubmitted' && step !== 'completed';

  async function copyAuthUrl() {
    if (!login) {
      return;
    }
    await navigator.clipboard.writeText(login.authUrl);
  }

  return (
    <div className="oauth-panel">
      <div className="oauth-actions">
        <Button variant="secondary" loading={starting} icon={<LockKeyhole size={16} />} onClick={onStart}>
          开始登录
        </Button>
        {login ? (
          <Button variant="ghost" loading={cancelling} onClick={onCancel}>
            取消登录
          </Button>
        ) : null}
      </div>

      {step === 'cancelled' ? <p className="muted">OAuth 登录已取消，准备好后可以重新开始。</p> : null}
      {step === 'expired' ? <p className="oauth-warning">OAuth 登录已过期，请重新开始。</p> : null}

      {login ? (
        <div className="oauth-session">
          <dl className="oauth-meta">
            <div>
              <dt>回调地址</dt>
              <dd>{login.redirectUri}</dd>
            </div>
            <div>
              <dt>登录 ID</dt>
              <dd>{login.loginId}</dd>
            </div>
            <div>
              <dt>过期时间</dt>
              <dd>{formatExpiresAt(login.expiresAt)}</dd>
            </div>
          </dl>

          {portInUse ? (
            <p className="oauth-warning">
              自动回调监听不可用。请手动粘贴浏览器回调 URL 后继续。
              {login.listenerError ? <span>{login.listenerError}</span> : null}
            </p>
          ) : (
            <p className="oauth-ready">自动回调监听已启动。请完成浏览器授权后返回这里。</p>
          )}

          <div className="oauth-url-row">
            <a className="oauth-auth-link" href={login.authUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              打开授权链接
            </a>
            <Button variant="ghost" icon={<Copy size={15} />} onClick={copyAuthUrl}>
              复制链接
            </Button>
          </div>

          <label className="import-field">
            <span>回调 URL</span>
            <textarea
              rows={4}
              spellCheck={false}
              value={callbackUrl}
              placeholder="http://localhost:1455/auth/callback?code=...&state=..."
              onChange={(event) => onCallbackUrlChange(event.target.value)}
            />
          </label>

          <div className="oauth-actions">
            <Button
              variant="secondary"
              loading={submittingCallback}
              disabled={!canSubmitCallback || submittingCallback}
              onClick={onSubmitCallback}
            >
              提交回调
            </Button>
            {step === 'callbackSubmitted' ? <span className="oauth-ready">已收到回调，正在添加账号...</span> : null}
          </div>
        </div>
      ) : (
        <p className="muted">开始登录并在浏览器完成授权。如果自动回调不可用，请粘贴完整回调 URL。</p>
      )}
    </div>
  );
}
