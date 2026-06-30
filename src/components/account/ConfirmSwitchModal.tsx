import type { CodexAccountView } from '../../types/codex';
import { Button } from '../ui/Button';
import './ConfirmSwitchModal.css';

interface ConfirmSwitchModalProps {
  account: CodexAccountView | null;
  switching: boolean;
  onCancel: () => void;
  onConfirm: (accountId: string) => void;
}

function accountSubtitle(account: CodexAccountView): string {
  return account.email ?? account.accountId ?? account.id;
}

function accountKind(account: CodexAccountView): string {
  if (account.isPatOnly) {
    return 'PAT';
  }
  return account.authMode === 'api_key' ? 'API Key' : 'OAuth';
}

export function ConfirmSwitchModal({ account, switching, onCancel, onConfirm }: ConfirmSwitchModalProps) {
  if (!account) {
    return null;
  }

  return (
    <div className="switch-modal-backdrop" role="presentation">
      <section className="switch-modal" role="dialog" aria-modal="true" aria-labelledby="switch-modal-title">
        <header>
          <h2 id="switch-modal-title">切换 Codex 账号？</h2>
          <p>这会用所选账号替换当前本地 Codex 授权文件。</p>
        </header>

        <div className="switch-modal-account">
          <span>{accountKind(account)}</span>
          <strong title={account.displayName}>{account.displayName}</strong>
          <code title={accountSubtitle(account)}>{accountSubtitle(account)}</code>
        </div>

        <footer>
          <Button variant="ghost" disabled={switching} onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" loading={switching} onClick={() => onConfirm(account.id)}>
            确认切换
          </Button>
        </footer>
      </section>
    </div>
  );
}
