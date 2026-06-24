import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Bot,
  Cable,
  ExternalLink,
  FolderOpen,
  HardDriveDownload,
  KeyRound,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCcw,
  RefreshCw,
  ShieldUser,
  Trash2,
} from 'lucide-react';
import { Tabs, type Tab } from '../components/ui/Tabs/Tabs';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { EmptyState } from '../components/ui/EmptyState/EmptyState';
import { SearchInput } from '../components/ui/SearchInput/SearchInput';
import { StatCard } from '../components/ui/StatCard/StatCard';
import { Panel } from '../components/ui/Panel/Panel';
import { ClaudeAccountModal } from '../components/claude/ClaudeAccountModal';
import { useClaudeAccountsStore } from '../stores/useClaudeAccountsStore';
import {
  isClaudeCliMode,
  isClaudeDesktopMode,
  matchesClaudePlatform,
  type ClaudeAccountView,
  type ClaudeApiKeyInput,
  type ClaudeDesktopGatewayInput,
} from '../types/claude';
import '../components/account/AccountRow.css';
import './ClaudeAccountsPage.css';

type WorkspaceTab = 'desktop' | 'cli';
type ModalState =
  | { type: 'closed' }
  | { type: 'create-desktop' }
  | { type: 'create-api' }
  | { type: 'edit'; account: ClaudeAccountView };

function formatMode(account: ClaudeAccountView): string {
  switch (account.authMode) {
    case 'desktop_oauth':
      return 'Desktop OAuth';
    case 'desktop_gateway':
      return 'Desktop Gateway';
    case 'cli_oauth':
      return 'CLI OAuth';
    case 'api_key':
      return 'API Key';
  }
}

function currentSlotLabel(account: ClaudeAccountView): string {
  return isClaudeDesktopMode(account.authMode) ? '当前 Desktop' : '当前 CLI';
}

function subtitle(account: ClaudeAccountView): string {
  return account.email ?? account.organizationName ?? account.accountId ?? account.id;
}

export function ClaudeAccountsPage() {
  const {
    accounts,
    currentAccounts,
    loading,
    saving,
    switchingAccountId,
    deletingAccountId,
    lastSwitchNotice,
    oauthAuthorizeUrl,
    error,
    loadAccounts,
    importDesktopFromLocal,
    importCliFromLocal,
    addDesktopGateway,
    addDesktopJson,
    addDesktopJsonFile,
    saveDesktopGateway,
    addApiKey,
    saveApiKey,
    beginCliOauth,
    finishCliOauth,
    switchAccount,
    removeAccount,
    clearOauthDraft,
  } = useClaudeAccountsStore();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('desktop');
  const [search, setSearch] = useState('');
  const [oauthCallback, setOauthCallback] = useState('');
  const [oauthEmailHint, setOauthEmailHint] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'closed' });

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const desktopAccounts = useMemo(() => accounts.filter((account) => isClaudeDesktopMode(account.authMode)), [accounts]);
  const cliAccounts = useMemo(() => accounts.filter((account) => isClaudeCliMode(account.authMode)), [accounts]);
  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts
      .filter((account) => matchesClaudePlatform(account, workspaceTab))
      .filter((account) => {
        if (!query) {
          return true;
        }
        return [account.displayName, account.email, account.organizationName, account.accountId, account.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      });
  }, [accounts, search, workspaceTab]);

  const tabs: Tab[] = [
    {
      id: 'desktop',
      label: 'Claude Desktop',
      icon: <MonitorSmartphone size={16} />,
      count: desktopAccounts.length,
    },
    {
      id: 'cli',
      label: 'Claude CLI',
      icon: <Bot size={16} />,
      count: cliAccounts.length,
    },
  ];

  async function handleOauthFinish() {
    await finishCliOauth(oauthCallback, oauthEmailHint.trim() || undefined);
    setOauthCallback('');
    setOauthEmailHint('');
  }

  const editingGateway = modal.type === 'edit' && modal.account.authMode === 'desktop_gateway' ? modal.account : null;
  const editingApi = modal.type === 'edit' && modal.account.authMode === 'api_key' ? modal.account : null;

  return (
    <div className="content accounts-content">
      <section className="accounts-dashboard claude-dashboard">
        {error ? <ErrorBanner error={error} /> : null}
        {lastSwitchNotice ? <div className="account-switch-notice">{lastSwitchNotice}</div> : null}

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Tabs tabs={tabs} activeTab={workspaceTab} onChange={(id) => setWorkspaceTab(id as WorkspaceTab)} />
        </div>

        <div className="accounts-stats" aria-label="Claude 账号统计">
          <StatCard icon={<MonitorSmartphone size={19} />} iconColor="primary" label="Desktop" value={desktopAccounts.length} meta="个账号" />
          <StatCard icon={<Bot size={19} />} iconColor="blue" label="CLI" value={cliAccounts.length} meta="个账号" />
          <StatCard icon={<ShieldUser size={19} />} iconColor="green" label="OAuth" value={accounts.filter((item) => item.authMode === 'desktop_oauth' || item.authMode === 'cli_oauth').length} meta="个账号" />
          <StatCard icon={<Cable size={19} />} iconColor="purple" label="Gateway / Key" value={accounts.filter((item) => item.authMode === 'desktop_gateway' || item.authMode === 'api_key').length} meta="个账号" />
        </div>

        <div className="accounts-toolbar" aria-label="Claude 账号操作">
          <SearchInput value={search} onChange={setSearch} placeholder={`搜索 ${workspaceTab === 'desktop' ? 'Desktop' : 'CLI'} 账号`} />
          <div className="accounts-toolbar-actions">
            {workspaceTab === 'desktop' ? (
              <>
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModal({ type: 'create-desktop' })}>
                  添加账号
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" loading={saving} icon={<HardDriveDownload size={16} />} onClick={() => void importCliFromLocal()}>
                  导入本机
                </Button>
                <Button variant="secondary" loading={saving} icon={<ShieldUser size={16} />} onClick={() => void beginCliOauth()}>
                  OAuth 登录
                </Button>
                <Button variant="primary" icon={<KeyRound size={16} />} onClick={() => setModal({ type: 'create-api' })}>
                  添加 API Key
                </Button>
              </>
            )}
          </div>
        </div>

        {workspaceTab === 'cli' && oauthAuthorizeUrl ? (
          <Panel className="claude-oauth-panel">
            <div className="claude-oauth-header">
              <div>
                <h3>Claude OAuth 登录</h3>
                <p>先打开授权链接完成登录，再把回调地址或 code 粘贴回来。</p>
              </div>
              <Button variant="ghost" icon={<RefreshCcw size={16} />} onClick={clearOauthDraft}>
                收起
              </Button>
            </div>
            <div className="claude-oauth-link-row">
              <code>{oauthAuthorizeUrl}</code>
              <a href={oauthAuthorizeUrl} target="_blank" rel="noreferrer" className="claude-inline-link">
                打开授权 <ExternalLink size={14} />
              </a>
            </div>
            <div className="claude-oauth-form">
              <label className="claude-inline-field">
                <span>回调地址或 code</span>
                <textarea rows={3} value={oauthCallback} onChange={(event) => setOauthCallback(event.target.value)} />
              </label>
              <label className="claude-inline-field">
                <span>邮箱提示（可选）</span>
                <input value={oauthEmailHint} onChange={(event) => setOauthEmailHint(event.target.value)} />
              </label>
              <div className="claude-oauth-actions">
                <Button variant="primary" loading={saving} disabled={oauthCallback.trim().length === 0} onClick={() => void handleOauthFinish()}>
                  完成登录
                </Button>
              </div>
            </div>
          </Panel>
        ) : null}

        <div className="claude-account-grid">
          {loading ? <p className="account-list-message">正在加载 Claude 账号...</p> : null}
          {!loading && visibleAccounts.length === 0 ? (
            <EmptyState
              title={workspaceTab === 'desktop' ? '还没有 Claude Desktop 账号' : '还没有 Claude CLI 账号'}
              description={workspaceTab === 'desktop' ? '导入本机 Desktop 登录态，或添加 Gateway 配置。' : '导入本机 CLI 登录态、完成 OAuth，或录入 API Key。'}
            />
          ) : null}
          {visibleAccounts.map((account) => {
            const slotEnabled = isClaudeDesktopMode(account.authMode)
              ? currentAccounts.claudeDesktopAccount === account.id
              : currentAccounts.claudeCodeAccount === account.id;
            const canEdit = account.authMode === 'desktop_gateway' || account.authMode === 'api_key';
            return (
              <article key={account.id} className={`account-card account-row claude-card ${account.isCurrent ? 'current' : ''}`}>
                <div className="account-card-main claude-card-main">
                  <span className="account-card-header">
                    <strong>{account.displayName}</strong>
                    <span className={`account-plan-badge claude-mode-tag ${account.authMode}`}>{formatMode(account)}</span>
                  </span>
                  <code className="account-card-id">{subtitle(account)}</code>

                  <dl className="claude-card-meta">
                    <div>
                      <dt>计划</dt>
                      <dd>{account.planType ?? '未识别'}</dd>
                    </div>
                    <div>
                      <dt>组织</dt>
                      <dd>{account.organizationName ?? '未记录'}</dd>
                    </div>
                    <div>
                      <dt>当前槽位</dt>
                      <dd>{slotEnabled ? `${isClaudeDesktopMode(account.authMode) ? 'Desktop' : 'CLI'} 已启用` : `${isClaudeDesktopMode(account.authMode) ? 'Desktop' : 'CLI'} 未启用`}</dd>
                    </div>
                    {account.isCurrent ? (
                      <div>
                        <dt>状态</dt>
                        <dd>{currentSlotLabel(account)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="claude-card-path">
                    {account.desktopProfileDir ? <code>{account.desktopProfileDir}</code> : account.apiBaseUrl ? <code>{account.apiBaseUrl}</code> : <span>未记录路径</span>}
                  </div>
                </div>

                <div className="account-card-actions claude-card-actions">
                  <IconButton
                    label={account.isCurrent ? '当前账号' : '切换账号'}
                    icon={switchingAccountId === account.id ? <RefreshCw className="spin-icon" size={16} /> : <ArrowRightLeft size={16} />}
                    active={account.isCurrent}
                    disabled={account.isCurrent || switchingAccountId === account.id}
                    onClick={() => void switchAccount(account.id)}
                  />
                  {canEdit ? (
                    <IconButton label="编辑账号" icon={<Pencil size={16} />} onClick={() => setModal({ type: 'edit', account })} />
                  ) : null}
                  <IconButton
                    label="删除账号"
                    icon={deletingAccountId === account.id ? <RefreshCw className="spin-icon" size={16} /> : <Trash2 size={16} />}
                    disabled={deletingAccountId === account.id}
                    onClick={() => void removeAccount(account.id)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ClaudeAccountModal
        open={modal.type === 'create-desktop' || Boolean(editingGateway)}
        mode={modal.type === 'create-desktop' ? 'create' : 'edit'}
        account={editingGateway}
        saving={saving}
        onClose={() => setModal({ type: 'closed' })}
        onImportDesktopLocal={() => importDesktopFromLocal().then(() => undefined)}
        onImportDesktopGateway={(input: ClaudeDesktopGatewayInput) => addDesktopGateway(input).then(() => undefined)}
        onImportDesktopJson={(jsonContent: string) => addDesktopJson({ jsonContent }).then(() => undefined)}
        onImportDesktopJsonFile={(filePath: string) => addDesktopJsonFile(filePath).then(() => undefined)}
        onSaveDesktopGateway={(accountId: string, input: ClaudeDesktopGatewayInput) =>
          saveDesktopGateway(accountId, input).then(() => undefined)
        }
      />
    </div>
  );
}
