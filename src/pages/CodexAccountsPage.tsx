import { useEffect, useMemo, useState } from 'react';
import { Crown, History, KeyRound, RefreshCw, UserPlus, Users } from 'lucide-react';
import { AccountRow } from '../components/account/AccountRow';
import { ConfirmSwitchModal } from '../components/account/ConfirmSwitchModal';
import { ConfirmDeleteModal } from '../components/account/ConfirmDeleteModal';
import { EditApiAccountModal } from '../components/account/EditApiAccountModal';
import { OAuthBindingModal } from '../components/account/OAuthBindingModal';
import { ImportDrawer } from '../components/import/ImportDrawer';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { EmptyState } from '../components/ui/EmptyState/EmptyState';
import { SearchInput } from '../components/ui/SearchInput/SearchInput';
import { StatCard } from '../components/ui/StatCard/StatCard';
import { useCodexAccountsStore } from '../stores/useCodexAccountsStore';
import { useCodexSessionsStore } from '../stores/useCodexSessionsStore';
import { useImportFlowStore } from '../stores/useImportFlowStore';
import { isOAuthAuthMode, type CodexAccountView } from '../types/codex';
import './CodexAccountsPage.css';

function matchesQuery(account: CodexAccountView, query: string): boolean {
  const haystack = [account.displayName, account.email, account.accountId, account.id]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function getMockResetCreditCount(): number | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get('mockResetCredits');
  if (value === null) {
    return null;
  }
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    return 20;
  }
  return Math.min(count, 99);
}

function createMockResetCreditAccount(count: number): CodexAccountView {
  const firstExpiry = new Date('2026-07-12T13:05:02+08:00').getTime();
  const secondExpiry = new Date('2026-07-18T08:50:14+08:00').getTime();
  const credits = Array.from({ length: count }, (_, index) => {
    const expiresAt =
      index === 0
        ? firstExpiry
        : index === 1
          ? secondExpiry
          : firstExpiry + (index + 2) * 86_400_000 + index * 3_600_000;
    return { expiresAt };
  });

  return {
    id: 'mock-reset-credits',
    displayName: '1547471276@qq.com',
    email: '1547471276@qq.com',
    authMode: 'oauth',
    isPatOnly: false,
    accountId: '39e543ed-4ffc-4649-8bff-cdf63559b4f8',
    planType: 'team',
    subscriptionActiveUntil: '2026-07-12T16:50:02+08:00',
    quota: {
      hourlyRemainingPercent: 99,
      weeklyRemainingPercent: 100,
      resetCredits: {
        total: count,
        credits,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
      stale: false,
    },
    quotaError: null,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isCurrent: false,
  };
}

interface CodexAccountsPageProps {
  onOpenSessions: () => void;
}

export function CodexAccountsPage({ onOpenSessions }: CodexAccountsPageProps) {
  const {
    accounts,
    loading,
    error,
    refreshingAll,
    refreshingAccountIds,
    switchingAccountId,
    deletingAccountId,
    updatingAccountId,
    lastSwitchNotice,
    loadAccounts,
    refreshAccountQuota,
    refreshAllQuotas,
    switchToAccount,
    deleteAccount,
    updateApiKeyAccount,
    updateApiKeyBoundOAuthAccount,
  } = useCodexAccountsStore();
  const sessions = useCodexSessionsStore((state) => state.sessions);
  const loadSessions = useCodexSessionsStore((state) => state.loadSessions);
  const openImportDrawer = useImportFlowStore((state) => state.openDrawer);
  const openOAuthLogin = useImportFlowStore((state) => state.openOAuthLogin);
  const [pendingSwitchAccountId, setPendingSwitchAccountId] = useState<string | null>(null);
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<string | null>(null);
  const [editingApiAccountId, setEditingApiAccountId] = useState<string | null>(null);
  const [bindingApiAccountId, setBindingApiAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const mockResetCreditCount = getMockResetCreditCount();
  const previewAccounts = useMemo(
    () => (mockResetCreditCount === null ? accounts : [createMockResetCreditAccount(mockResetCreditCount)]),
    [accounts, mockResetCreditCount],
  );
  const isPreviewMode = mockResetCreditCount !== null;

  useEffect(() => {
    void loadAccounts();
    void loadSessions();
  }, [loadAccounts, loadSessions]);

  const oauthAccountCount = useMemo(
    () => previewAccounts.filter((account) => isOAuthAuthMode(account.authMode) && !account.isPatOnly).length,
    [previewAccounts],
  );
  const apiAccountCount = useMemo(
    () => previewAccounts.filter((account) => account.authMode === 'api_key').length,
    [previewAccounts],
  );
  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) {
      return previewAccounts;
    }
    return previewAccounts.filter((account) => matchesQuery(account, query));
  }, [previewAccounts, searchQuery]);
  const pendingSwitchAccount = useMemo(
    () => accounts.find((account) => account.id === pendingSwitchAccountId) ?? null,
    [accounts, pendingSwitchAccountId],
  );
  const pendingDeleteAccount = useMemo(
    () => accounts.find((account) => account.id === pendingDeleteAccountId) ?? null,
    [accounts, pendingDeleteAccountId],
  );
  const editingApiAccount = useMemo(
    () => accounts.find((account) => account.id === editingApiAccountId) ?? null,
    [accounts, editingApiAccountId],
  );
  const bindingApiAccount = useMemo(
    () => accounts.find((account) => account.id === bindingApiAccountId) ?? null,
    [accounts, bindingApiAccountId],
  );

  async function confirmSwitch(accountId: string) {
    await switchToAccount(accountId);
    await loadSessions();
    setPendingSwitchAccountId(null);
  }

  async function confirmDelete(accountId: string) {
    await deleteAccount(accountId);
    setPendingDeleteAccountId(null);
  }

  async function saveApiAccount(accountId: string, apiKey: string, apiBaseUrl: string | null, displayName: string | null) {
    await updateApiKeyAccount(accountId, apiKey, apiBaseUrl, displayName);
    setEditingApiAccountId(null);
  }

  async function saveOAuthBinding(accountId: string, boundOAuthAccountId: string | null) {
    await updateApiKeyBoundOAuthAccount(accountId, boundOAuthAccountId);
    setBindingApiAccountId(null);
  }

  return (
    <>
      {!isPreviewMode && error ? <ErrorBanner error={error} /> : null}
      {lastSwitchNotice ? <div className="account-switch-notice">{lastSwitchNotice}</div> : null}

      <div className="accounts-stats" aria-label="Codex 账号统计">
        <StatCard icon={<Users size={19} />} iconColor="primary" label="Codex 账号" value={previewAccounts.length} meta="个账号" />
        <StatCard icon={<Crown size={19} />} iconColor="blue" label="OAuth 账号" value={oauthAccountCount} meta="个账号" />
        <StatCard icon={<KeyRound size={19} />} iconColor="green" label="API Key 账号" value={apiAccountCount} meta="个账号" />
        <StatCard icon={<History size={19} />} iconColor="purple" label="会话数" value={sessions.length} meta="条会话" />
      </div>

      <div className="accounts-toolbar" aria-label="Codex 账号操作">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索 Codex 账号"
        />
        <div className="accounts-toolbar-actions">
          <Button
            variant="secondary"
            aria-label="刷新全部 Codex 账号额度"
            icon={<RefreshCw size={16} />}
            loading={refreshingAll}
            disabled={loading || oauthAccountCount === 0 || isPreviewMode}
            onClick={() => void refreshAllQuotas()}
          >
            刷新
          </Button>
          <Button variant="primary" aria-label="添加 Codex 账号" icon={<UserPlus size={16} />} onClick={openImportDrawer}>
            添加账号
          </Button>
        </div>
      </div>

      <div className="account-card-grid">
        {loading && !isPreviewMode ? <p className="account-list-message">正在加载 Codex 账号...</p> : null}
        {!loading && previewAccounts.length === 0 ? (
          <EmptyState
            title="还没有 Codex 账号"
            description="添加当前本地 Codex 授权，或导入另一个账号。"
            action={
              <Button variant="primary" aria-label="添加 Codex 账号" icon={<UserPlus size={16} />} onClick={openImportDrawer}>
                添加账号
              </Button>
            }
          />
        ) : null}
        {!loading && previewAccounts.length > 0 && filteredAccounts.length === 0 ? (
          <p className="account-list-message">没有匹配 "{searchQuery.trim()}" 的 Codex 账号。</p>
        ) : null}
        {filteredAccounts.map((account) => (
          <AccountRow
            account={account}
            boundOAuthAccount={
              account.boundOauthAccountId
                ? previewAccounts.find((candidate) => candidate.id === account.boundOauthAccountId) ?? null
                : null
            }
            key={account.id}
            refreshing={refreshingAll || refreshingAccountIds.includes(account.id)}
            switching={switchingAccountId === account.id}
            deleting={deletingAccountId === account.id}
            onRefreshQuota={(accountId) => void refreshAccountQuota(accountId)}
            onSwitch={setPendingSwitchAccountId}
            onDelete={setPendingDeleteAccountId}
            onEditApiAccount={(nextAccount) => setEditingApiAccountId(nextAccount.id)}
            onBindOAuthAccount={(nextAccount) => setBindingApiAccountId(nextAccount.id)}
            onReauthenticate={() => void openOAuthLogin()}
          />
        ))}
      </div>

      <ImportDrawer />
      <ConfirmSwitchModal
        account={pendingSwitchAccount}
        switching={switchingAccountId === pendingSwitchAccountId}
        onCancel={() => setPendingSwitchAccountId(null)}
        onConfirm={(accountId) => void confirmSwitch(accountId)}
      />
      <ConfirmDeleteModal
        account={pendingDeleteAccount}
        deleting={deletingAccountId === pendingDeleteAccountId}
        onCancel={() => setPendingDeleteAccountId(null)}
        onConfirm={(accountId) => void confirmDelete(accountId)}
      />
      <EditApiAccountModal
        account={editingApiAccount}
        saving={updatingAccountId === editingApiAccountId}
        onCancel={() => setEditingApiAccountId(null)}
        onSave={(accountId, apiKey, apiBaseUrl, displayName) =>
          void saveApiAccount(accountId, apiKey, apiBaseUrl, displayName)
        }
      />
      <OAuthBindingModal
        apiAccount={bindingApiAccount}
        accounts={accounts}
        saving={updatingAccountId === bindingApiAccountId}
        onCancel={() => setBindingApiAccountId(null)}
        onSave={(accountId, boundOAuthAccountId) => void saveOAuthBinding(accountId, boundOAuthAccountId)}
      />
    </>
  );
}
