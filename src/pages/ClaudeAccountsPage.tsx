import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Cable,
  ExternalLink,
  MonitorSmartphone,
  Plus,
  RefreshCcw,
  ShieldUser,
} from 'lucide-react';
import { Tabs, type Tab } from '../components/ui/Tabs/Tabs';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { EmptyState } from '../components/ui/EmptyState/EmptyState';
import { SearchInput } from '../components/ui/SearchInput/SearchInput';
import { StatCard } from '../components/ui/StatCard/StatCard';
import { Panel } from '../components/ui/Panel/Panel';
import { ClaudeAccountCard } from '../components/claude/ClaudeAccountCard';
import { ClaudeApiKeyModal } from '../components/claude/ClaudeApiKeyModal';
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
import './ClaudeAccountsPage.css';

type WorkspaceTab = 'desktop' | 'cli';
type ModalState =
  | { type: 'closed' }
  | { type: 'create-desktop' }
  | { type: 'create-api' }
  | { type: 'edit'; account: ClaudeAccountView };

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
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setModal({ type: 'create-api' })}>
                  添加账号
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
              description={workspaceTab === 'desktop' ? '导入本机 Desktop 登录态，或添加 Gateway 配置。' : '导入本机 CLI 登录态、完成 OAuth，或添加 Gateway 配置。'}
            />
          ) : null}
          {visibleAccounts.map((account) => (
            <ClaudeAccountCard
              key={account.id}
              account={account}
              currentAccounts={currentAccounts}
              switching={switchingAccountId === account.id}
              deleting={deletingAccountId === account.id}
              onSwitch={(accountId) => void switchAccount(accountId)}
              onEdit={(nextAccount) => setModal({ type: 'edit', account: nextAccount })}
              onDelete={(accountId) => void removeAccount(accountId)}
            />
          ))}
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
      <ClaudeApiKeyModal
        open={modal.type === 'create-api' || Boolean(editingApi)}
        account={editingApi}
        saving={saving}
        onClose={() => setModal({ type: 'closed' })}
        onCreate={(input: ClaudeApiKeyInput) => addApiKey(input).then(() => undefined)}
        onSave={(accountId: string, input: ClaudeApiKeyInput) => saveApiKey(accountId, input).then(() => undefined)}
      />
    </div>
  );
}
