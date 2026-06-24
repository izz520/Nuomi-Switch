import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Link, Tag } from 'lucide-react';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button';
import type { ClaudeAccountView, ClaudeApiKeyInput } from '../../types/claude';
import './ClaudeApiKeyModal.css';

interface ClaudeApiKeyModalProps {
  open: boolean;
  account?: ClaudeAccountView | null;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: ClaudeApiKeyInput) => Promise<void>;
  onSave: (accountId: string, input: ClaudeApiKeyInput) => Promise<void>;
}

const defaultApiBaseUrl = 'https://api.anthropic.com';

export function ClaudeApiKeyModal({
  open,
  account,
  saving,
  onClose,
  onCreate,
  onSave,
}: ClaudeApiKeyModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDisplayName(account?.displayName ?? '');
    setApiKey(account?.apiKey ?? '');
    setApiBaseUrl(account?.apiBaseUrl ?? defaultApiBaseUrl);
  }, [account, open]);

  const payload = useMemo<ClaudeApiKeyInput>(
    () => ({
      displayName: displayName.trim(),
      apiKey: apiKey.trim(),
      apiBaseUrl: apiBaseUrl.trim(),
    }),
    [apiBaseUrl, apiKey, displayName],
  );

  const canSave = payload.displayName.length > 0 && payload.apiKey.length > 0 && payload.apiBaseUrl.length > 0;
  const isEdit = Boolean(account);

  const footer = (
    <>
      <Button variant="ghost" disabled={saving} onClick={onClose}>
        取消
      </Button>
      <Button
        variant="primary"
        icon={<KeyRound size={16} />}
        loading={saving}
        disabled={!canSave}
        onClick={() => {
          if (account) {
            void onSave(account.id, payload).then(onClose);
            return;
          }
          void onCreate(payload).then(onClose);
        }}
      >
        {isEdit ? '保存 API Key' : '添加 API Key'}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '编辑 Claude API Key' : '添加 Claude API Key'} footer={footer}>
      <div className="claude-api-modal-fields">
        <label>
          <span>
            <Tag size={15} />
            名称
          </span>
          <input
            value={displayName}
            placeholder="例如 LY Free"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span>
            <KeyRound size={15} />
            API Key
          </span>
          <input
            value={apiKey}
            placeholder="sk-..."
            spellCheck={false}
            type="password"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label>
          <span>
            <Link size={15} />
            基础地址
          </span>
          <input
            value={apiBaseUrl}
            placeholder="https://api.anthropic.com"
            spellCheck={false}
            onChange={(event) => setApiBaseUrl(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
