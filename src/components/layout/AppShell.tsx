import {
  FileText,
  type LucideIcon,
  Monitor,
  Moon,
  MessagesSquare,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { type PointerEvent, type ReactNode } from 'react';
import { startWindowDragging } from '../../services/windowService';
import { type ThemePreference, useThemeStore } from '../../stores/useThemeStore';

type Page = 'accounts' | 'sessions' | 'claude' | 'settings' | 'logs';

interface AppShellProps {
  page: Page;
  setPage: (page: Page) => void;
  children: ReactNode;
}

const PAGE_META: Record<Page, { title: string; icon: LucideIcon }> = {
  accounts: { title: '账号管理', icon: Users },
  sessions: { title: '会话管理', icon: MessagesSquare },
  claude: { title: 'Claude Code', icon: MessagesSquare },
  settings: { title: '设置', icon: Settings },
  logs: { title: '日志', icon: FileText },
};

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'auto', label: '跟随系统', icon: Monitor },
  { value: 'dark', label: '深色', icon: Moon },
];

function ThemeToggle() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <div className="theme-toggle" role="group" aria-label="主题切换">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={`theme-toggle-option ${preference === value ? 'active' : ''}`}
          aria-pressed={preference === value}
          title={label}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

export function AppShell({ page, setPage, children }: AppShellProps) {
  const handleTopbarPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    void startWindowDragging();
  };

  const stopDrag = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const isAccountsArea = page === 'accounts' || page === 'sessions';
  const TitleIcon = PAGE_META[page].icon;

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="主导航">
        <div className="app-brand">
          <div className="app-logo" aria-hidden="true">
            <img src="/nuomi-logo.png" alt="" />
          </div>
        </div>

        <div className="nav-section">
          <button
            className={`nav-button ${isAccountsArea ? 'active' : ''}`}
            aria-label="账号管理"
            aria-current={isAccountsArea ? 'page' : undefined}
            title="账号管理"
            onClick={() => setPage('accounts')}
          >
            <img src="/chatgpt-icon.svg" alt="" className="nav-icon-img" />
          </button>
          <button
            className={`nav-button ${page === 'claude' ? 'active' : ''}`}
            aria-label="Claude Code"
            aria-current={page === 'claude' ? 'page' : undefined}
            title="Claude Code"
            onClick={() => setPage('claude')}
          >
            <img src="/claude-icon.svg" alt="" className="nav-icon-img" />
          </button>
        </div>

        <div className="nav-footer">
          <button
            className={`nav-button ${page === 'logs' ? 'active' : ''}`}
            aria-label="日志"
            aria-current={page === 'logs' ? 'page' : undefined}
            title="日志"
            onClick={() => setPage('logs')}
          >
            <FileText size={19} />
          </button>
          <button
            className={`nav-button ${page === 'settings' ? 'active' : ''}`}
            aria-label="设置"
            aria-current={page === 'settings' ? 'page' : undefined}
            title="设置"
            onClick={() => setPage('settings')}
          >
            <Settings size={19} />
          </button>
        </div>
      </nav>
      <main className="app-main">
        <header className="topbar" data-tauri-drag-region onPointerDown={handleTopbarPointerDown}>
          <div className="topbar-content">
            <div className="topbar-title-group">
              <span className="topbar-title-icon" aria-hidden="true">
                <TitleIcon size={16} />
              </span>
              <h1 className="page-title">{PAGE_META[page].title}</h1>
            </div>
            <div className="topbar-actions" onPointerDown={stopDrag}>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
