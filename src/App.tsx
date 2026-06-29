import { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { CodexResetSettingsPage } from './pages/CodexResetSettingsPage';
import { CodexAccountsPage } from './pages/CodexAccountsPage';
import { ClaudeAccountsPage } from './pages/ClaudeAccountsPage';
import { CodexSessionsPage } from './pages/CodexSessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogsPage } from './pages/LogsPage';
import { Tabs, type Tab } from './components/ui/Tabs/Tabs';
import { Users, History, RotateCcw } from 'lucide-react';
import { useCodexAccountsStore } from './stores/useCodexAccountsStore';
import { useCodexSessionsStore } from './stores/useCodexSessionsStore';

type Page = 'accounts' | 'sessions' | 'claude' | 'settings' | 'logs';
type AccountTab = 'accounts' | 'sessions' | 'reset';

export function App() {
  const [page, setPage] = useState<Page>('accounts');
  const [accountTab, setAccountTab] = useState<AccountTab>('accounts');
  const accounts = useCodexAccountsStore((state) => state.accounts);
  const sessions = useCodexSessionsStore((state) => state.sessions);

  const accountTabs: Tab[] = [
    {
      id: 'accounts',
      label: 'Codex 账号',
      icon: <Users size={16} />,
      count: accounts.length,
    },
    {
      id: 'sessions',
      label: 'Codex 会话',
      icon: <History size={16} />,
      count: sessions.length,
    },
    {
      id: 'reset',
      label: '重置设置',
      icon: <RotateCcw size={16} />,
    },
  ];

  return (
    <AppShell page={page} setPage={setPage}>
      {page === 'accounts' || page === 'sessions' ? (
        <div className="content accounts-content">
          <section className="accounts-dashboard">
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <Tabs tabs={accountTabs} activeTab={accountTab} onChange={(id) => setAccountTab(id as AccountTab)} />
            </div>
            {accountTab === 'accounts' ? (
              <CodexAccountsPage onOpenSessions={() => setAccountTab('sessions')} />
            ) : accountTab === 'sessions' ? (
              <CodexSessionsPage onBack={() => setAccountTab('accounts')} />
            ) : (
              <CodexResetSettingsPage />
            )}
          </section>
        </div>
      ) : page === 'claude' ? (
        <ClaudeAccountsPage />
      ) : page === 'settings' ? (
        <SettingsPage />
      ) : (
        <LogsPage />
      )}
    </AppShell>
  );
}
