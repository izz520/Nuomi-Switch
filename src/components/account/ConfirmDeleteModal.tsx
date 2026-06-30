import type { CodexAccountView } from '../../types/codex';
import { Button } from '../ui/Button';
import './ConfirmDeleteModal.css';

interface ConfirmDeleteModalProps {
  account: CodexAccountView | null;
  deleting: boolean;
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

export function ConfirmDeleteModal({ account, deleting, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  if (!account) {
    return null;
  }

  return (
    <div className="delete-modal-backdrop" role="presentation">
      <section className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <header>
          <h2 id="delete-modal-title">删除这个账号？</h2>
          <p>这只会从 Nuomi Switch 删除保存的账号，不会让你在其他地方退出登录。</p>
        </header>

        <div className="delete-modal-account">
          <span>{accountKind(account)}</span>
          <strong title={account.displayName}>{account.displayName}</strong>
          <code title={accountSubtitle(account)}>{accountSubtitle(account)}</code>
        </div>

        {account.isCurrent ? (
          <p className="delete-modal-warning" role="alert">
            这是当前账号。删除保存记录不会清空正在使用的本地 Codex 授权文件；如果不想继续使用它，请先切换到其他账号。
          </p>
        ) : null}

        <footer>
          <Button variant="ghost" disabled={deleting} onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => onConfirm(account.id)}>
            删除账号
          </Button>
        </footer>
      </section>
    </div>
  );
}
