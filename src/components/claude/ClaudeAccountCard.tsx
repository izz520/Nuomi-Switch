import { useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  KeyRound,
  Link as LinkIcon,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import type { ClaudeAccountView, ClaudeCurrentAccounts } from '../../types/claude';
import { isClaudeDesktopMode } from '../../types/claude';
import '../account/AccountRow.css';
import './ClaudeAccountCard.css';

interface ClaudeAccountCardProps {
  account: ClaudeAccountView;
  currentAccounts: ClaudeCurrentAccounts;
  switching: boolean;
  deleting: boolean;
  onSwitch: (accountId: string) => void;
  onEdit: (account: ClaudeAccountView) => void;
  onDelete: (accountId: string) => void;
}

function formatMode(account: ClaudeAccountView): string {
  switch (account.authMode) {
    case 'desktop_oauth':
      return 'Desktop OAuth';
    case 'desktop_gateway':
      return 'API';
    case 'cli_oauth':
      return 'CLI OAuth';
    case 'api_key':
      return 'API';
  }
}

function subtitle(account: ClaudeAccountView): string {
  return account.email ?? account.organizationName ?? account.accountId ?? account.id;
}

function sourceLabel(account: ClaudeAccountView): string {
  switch (account.authMode) {
    case 'desktop_oauth':
      return 'Desktop 登录态';
    case 'desktop_gateway':
      return 'API';
    case 'cli_oauth':
      return 'CLI OAuth';
    case 'api_key':
      return 'API Key';
  }
}

function maskApiKey(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'sk-********************';
  }
  const prefix = trimmed.startsWith('sk-') ? 'sk-' : trimmed.slice(0, Math.min(3, trimmed.length));
  return `${prefix}${'*'.repeat(20)}`;
}

function getApiBaseUrl(account: ClaudeAccountView): string {
  return account.apiBaseUrl?.trim() || '未配置基础地址';
}

function isEditable(account: ClaudeAccountView): boolean {
  return account.authMode === 'desktop_gateway' || account.authMode === 'api_key';
}

function getConfigValue(account: ClaudeAccountView, slotName: string): string {
  return account.desktopProfileDir ?? account.apiBaseUrl ?? `${slotName} 本地配置`;
}

export function ClaudeAccountCard({
  account,
  currentAccounts,
  switching,
  deleting,
  onSwitch,
  onEdit,
  onDelete,
}: ClaudeAccountCardProps) {
  const [copiedField, setCopiedField] = useState<'apiKey' | 'apiBaseUrl' | null>(null);
  const isApiAccount = account.authMode === 'api_key';
  const slotName = isClaudeDesktopMode(account.authMode) ? 'Desktop' : 'CLI';
  const configValue = getConfigValue(account, slotName);
  const showsApiCredential = account.authMode === 'api_key' || account.authMode === 'desktop_gateway';

  async function copyField(field: 'apiKey' | 'apiBaseUrl', value?: string | null) {
    const text = value?.trim();
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1300);
  }

  return (
    <article
      className={`account-card account-row claude-card ${isApiAccount ? 'api-account-card' : ''} ${
        account.isCurrent ? 'current' : ''
      }`}
    >
      <div className="account-card-main claude-card-main">
        <span className="account-card-header">
          <strong>{account.displayName}</strong>
          <span className={`account-plan-badge claude-mode-tag ${account.authMode}`}>{formatMode(account)}</span>
        </span>

        <div className="api-account-fields claude-account-fields">
          <div className="api-account-field">
            <span className="api-account-field-label">
              <KeyRound size={14} />
              {isApiAccount ? 'API Key' : sourceLabel(account)}
            </span>
            <span className="api-account-field-actions">
              {showsApiCredential ? (
                <button type="button" aria-label="显示 API Key" disabled>
                  <Eye size={13} />
                </button>
              ) : null}
              <button
                type="button"
                aria-label={copiedField === 'apiKey' ? '账号信息已复制' : '复制账号信息'}
                className={copiedField === 'apiKey' ? 'copied' : ''}
                title={copiedField === 'apiKey' ? '复制成功' : '复制账号信息'}
                disabled={showsApiCredential ? !account.apiKey : !subtitle(account)}
                onClick={() => void copyField('apiKey', showsApiCredential ? account.apiKey : subtitle(account))}
              >
                {copiedField === 'apiKey' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </span>
            <code>{showsApiCredential ? maskApiKey(account.apiKey) : subtitle(account)}</code>
          </div>
          <div className="api-account-field">
            <span className="api-account-field-label">
              <LinkIcon size={14} />
              {isApiAccount || account.authMode === 'desktop_gateway' ? '基础地址' : '配置位置'}
            </span>
            <span className="api-account-field-actions">
              <button
                type="button"
                aria-label={copiedField === 'apiBaseUrl' ? '配置地址已复制' : '复制配置地址'}
                className={copiedField === 'apiBaseUrl' ? 'copied' : ''}
                title={copiedField === 'apiBaseUrl' ? '复制成功' : '复制配置地址'}
                disabled={!configValue}
                onClick={() => void copyField('apiBaseUrl', isApiAccount ? getApiBaseUrl(account) : configValue)}
              >
                {copiedField === 'apiBaseUrl' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </span>
            <code>{isApiAccount ? getApiBaseUrl(account) : configValue}</code>
          </div>
        </div>
      </div>

      <div className="account-card-actions claude-card-actions">
        <IconButton
          label={account.isCurrent ? '当前账号' : '切换账号'}
          icon={switching ? <RefreshCw className="spin-icon" size={16} /> : <Play size={16} />}
          active={account.isCurrent}
          disabled={account.isCurrent || switching}
          onClick={() => onSwitch(account.id)}
        />
        {isEditable(account) ? <IconButton label="编辑账号" icon={<Pencil size={16} />} onClick={() => onEdit(account)} /> : null}
        <IconButton
          label="删除账号"
          icon={deleting ? <RefreshCw className="spin-icon" size={16} /> : <Trash2 size={16} />}
          disabled={deleting}
          onClick={() => onDelete(account.id)}
        />
      </div>
    </article>
  );
}
