import { CalendarDays, Check, Clock3, Copy, Eye, KeyRound, Link, Link2, Pencil, Play, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { isOAuthAuthMode, type CodexAccountView, type CodexResetCreditView } from '../../types/codex';
import type { AppError } from '../../types/system';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal/Modal';
import './AccountRow.css';

interface AccountRowProps {
  account: CodexAccountView;
  boundOAuthAccount: CodexAccountView | null;
  refreshing: boolean;
  switching: boolean;
  deleting: boolean;
  onRefreshQuota: (accountId: string) => void;
  onSwitch: (accountId: string) => void;
  onDelete: (accountId: string) => void;
  onEditApiAccount: (account: CodexAccountView) => void;
  onBindOAuthAccount: (account: CodexAccountView) => void;
  onReauthenticate: (accountId: string) => void;
}

function parseSubscriptionTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatExpiry(value?: string | null): string | null {
  const timestamp = parseSubscriptionTimestamp(value);
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).toLocaleString();
}

function formatRemainingDays(value?: string | null): string {
  const timestamp = parseSubscriptionTimestamp(value);
  if (!timestamp) {
    return '-';
  }
  const msRemaining = timestamp - Date.now();
  return String(Math.max(0, Math.ceil(msRemaining / 86_400_000)));
}

function formatQuotaLabel(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return `${Math.max(0, Math.min(100, value))}%`;
}

function normalizePlanType(planType?: string | null): string {
  return planType?.trim().toLowerCase().replace(/[\s_-]+/g, '') ?? '';
}

function getNonExpiringPlanLabel(planType?: string | null): string | null {
  const plan = normalizePlanType(planType);
  if (plan === 'free' || plan === '') {
    return 'Free';
  }
  if (plan.includes('k12')) {
    return 'K12';
  }
  return null;
}

function getValidityDisplay(
  planType: string | null | undefined,
  expiresAt: string | null,
): { label: string; detail: string | null } {
  const expiresAtText = formatExpiry(expiresAt);
  if (expiresAtText) {
    return {
      label: `有效期 ${formatRemainingDays(expiresAt)} 天`,
      detail: expiresAtText,
    };
  }

  const nonExpiringPlanLabel = getNonExpiringPlanLabel(planType);
  if (nonExpiringPlanLabel) {
    return {
      label: '有效期 无固定期限',
      detail: null,
    };
  }

  return {
    label: '有效期未知',
    detail: '未获取到期时间',
  };
}

function parseResetCreditTimestamp(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 10_000_000_000 ? value : value * 1000;
}

function formatResetCreditExpiry(value?: number | null): string {
  const timestamp = parseResetCreditTimestamp(value);
  if (!timestamp) {
    return '有效期未知';
  }
  return new Date(timestamp).toLocaleString();
}

function formatResetCreditDateTime(value?: number | null): string | undefined {
  const timestamp = parseResetCreditTimestamp(value);
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp).toISOString();
}

function formatResetCreditExpiryParts(value?: number | null): { date: string; time: string; full: string } {
  const timestamp = parseResetCreditTimestamp(value);
  if (!timestamp) {
    return {
      date: '有效期未知',
      time: '--:--:--',
      full: '有效期未知',
    };
  }
  const date = new Date(timestamp);
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const timeText = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return {
    date: dateText,
    time: timeText,
    full: `${dateText} ${timeText}`,
  };
}

type PlanTone = 'api' | 'default' | 'free' | 'k12' | 'pat' | 'plus' | 'pro' | 'team';

function getPlanTone(planType?: string | null): PlanTone {
  const plan = normalizePlanType(planType);
  if (plan.includes('pro')) {
    return 'pro';
  }
  if (plan.includes('team')) {
    return 'team';
  }
  if (plan.includes('plus')) {
    return 'plus';
  }
  if (plan.includes('k12')) {
    return 'k12';
  }
  if (plan === 'free' || plan === '') {
    return 'free';
  }
  return 'default';
}

function canReauthenticateAccount(account: CodexAccountView): boolean {
  return isOAuthAuthMode(account.authMode) && !account.isPatOnly && account.quotaError !== null && account.quotaError !== undefined;
}

function getQuotaErrorSummary(error: AppError): { title: string; action: string } {
  const text = `${error.code} ${error.message}`.toLowerCase();
  if (
    error.code === 'CODEX_QUOTA_UNAUTHORIZED' ||
    text.includes('token_invalidated') ||
    text.includes('token_revoked') ||
    text.includes('authentication token has been invalidated')
  ) {
    return {
      title: '授权已失效',
      action: '请重新授权后再刷新额度。',
    };
  }

  if (text.includes('http 401') || text.includes('http 403')) {
    return {
      title: '额度接口认证失败',
      action: '请重新授权或检查账号状态。',
    };
  }

  return {
    title: error.message.split('.')[0] || '额度刷新失败',
    action: error.action,
  };
}

function getMaskedApiKey(): string {
  return 'sk-********************';
}

function getCopyableApiKey(account: CodexAccountView): string {
  return account.apiKey ?? '';
}

function getApiBaseUrl(account: CodexAccountView): string {
  return account.apiBaseUrl ?? 'https://api.openai.com/v1';
}

function getOAuthBindingText(boundOAuthAccount: CodexAccountView | null): string {
  if (!boundOAuthAccount) {
    return '未绑定';
  }
  return boundOAuthAccount.email ?? boundOAuthAccount.displayName;
}

function ResetCreditExpiryItem({
  credit,
  index,
  variant = 'compact',
}: {
  credit: CodexResetCreditView;
  index: number;
  variant?: 'compact' | 'modal';
}) {
  const expiryText = formatResetCreditExpiry(credit.expiresAt);
  const expiryParts = formatResetCreditExpiryParts(credit.expiresAt);
  const dateTime = formatResetCreditDateTime(credit.expiresAt);

  return (
    <span className={`reset-credit-expiry-item reset-credit-expiry-item-${variant}`}>
      <span className="reset-credit-expiry-index">{index + 1}</span>
      <span className="reset-credit-expiry-body">
        <span className="reset-credit-expiry-label">到期时间</span>
        <time dateTime={dateTime} title={expiryText} aria-label={expiryParts.full}>
          <span className="reset-credit-expiry-date">{expiryParts.date}</span>
          <span className="reset-credit-expiry-clock">{expiryParts.time}</span>
        </time>
      </span>
    </span>
  );
}

export function AccountRow({
  account,
  boundOAuthAccount,
  refreshing,
  switching,
  deleting,
  onRefreshQuota,
  onSwitch,
  onDelete,
  onEditApiAccount,
  onBindOAuthAccount,
  onReauthenticate,
}: AccountRowProps) {
  const [copiedField, setCopiedField] = useState<'apiKey' | 'apiBaseUrl' | null>(null);
  const [showResetCreditsModal, setShowResetCreditsModal] = useState(false);
  const isPersonalAccessToken = account.isPatOnly;
  const quotaUnsupported = account.authMode === 'api_key' || isPersonalAccessToken;
  const planText = isPersonalAccessToken ? 'PAT' : quotaUnsupported ? 'API' : account.planType ?? '免费';
  const hourly = account.quota?.hourlyRemainingPercent;
  const weekly = account.quota?.weeklyRemainingPercent;
  const normalizedHourly = typeof hourly === 'number' ? Math.max(0, Math.min(100, hourly)) : 0;
  const normalizedWeekly = typeof weekly === 'number' ? Math.max(0, Math.min(100, weekly)) : 0;
  const planTone: PlanTone = isPersonalAccessToken
    ? 'pat'
    : account.authMode === 'api_key'
      ? 'api'
      : getPlanTone(account.planType);
  const canReauthenticate = canReauthenticateAccount(account);
  const hasQuotaError = !isPersonalAccessToken && account.quotaError !== null && account.quotaError !== undefined;
  const quotaErrorSummary = account.quotaError ? getQuotaErrorSummary(account.quotaError) : null;
  const expiresAt = account.subscriptionActiveUntil ?? null;
  const validityDisplay = getValidityDisplay(account.planType, expiresAt);
  const resetCredits = account.quota?.resetCredits ?? null;
  const resetCreditTotal = resetCredits ? Math.max(resetCredits.total, resetCredits.credits.length, 0) : null;
  const resetCreditItems = resetCredits?.credits ?? [];
  const missingResetCreditExpiryCount =
    resetCreditItems.length > 0 && resetCreditTotal !== null
      ? Math.max(0, resetCreditTotal - resetCreditItems.length)
      : 0;
  const resetCreditEmptyText = !resetCredits
    ? '刷新后显示'
    : resetCreditTotal === 0
      ? '无可用机会'
      : '有效期未返回';

  async function copyField(field: 'apiKey' | 'apiBaseUrl', value: string) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1300);
  }

  return (
    <article className={`account-card account-row ${quotaUnsupported ? 'api-account-card' : ''} ${account.isCurrent ? 'current' : ''}`}>
      <div className="account-card-main account-summary">
        <span className="account-card-header">
          <strong>{account.email ?? account.displayName}</strong>
          <span className={`account-plan-badge account-plan-${planTone}`}>{planText.toLocaleUpperCase()}</span>
        </span>

        {quotaUnsupported ? (
          <>
            <div className="api-account-fields">
              <div className="api-account-field">
                <span className="api-account-field-label">
                  <KeyRound size={14} />
                  {isPersonalAccessToken ? 'Personal Access Token' : 'API Key'}
                </span>
                <span className="api-account-field-actions">
                  <button type="button" aria-label="显示 API Key" disabled>
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={copiedField === 'apiKey' ? 'API Key 已复制' : '复制 API Key'}
                    className={copiedField === 'apiKey' ? 'copied' : ''}
                    title={copiedField === 'apiKey' ? '复制成功' : '复制 API Key'}
                    disabled={isPersonalAccessToken || !account.apiKey}
                    onClick={() => void copyField('apiKey', getCopyableApiKey(account))}
                  >
                    {copiedField === 'apiKey' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </span>
                <code>{isPersonalAccessToken ? 'at-********************' : getMaskedApiKey()}</code>
              </div>
              {!isPersonalAccessToken ? (
                <div className="api-account-field">
                  <span className="api-account-field-label">
                    <Link size={14} />
                    基础地址
                  </span>
                  <span className="api-account-field-actions">
                    <button
                      type="button"
                      aria-label={copiedField === 'apiBaseUrl' ? 'API 基础地址已复制' : '复制 API 基础地址'}
                      className={copiedField === 'apiBaseUrl' ? 'copied' : ''}
                      title={copiedField === 'apiBaseUrl' ? '复制成功' : '复制基础地址'}
                      onClick={() => void copyField('apiBaseUrl', getApiBaseUrl(account))}
                    >
                      {copiedField === 'apiBaseUrl' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </span>
                  <code>{getApiBaseUrl(account)}</code>
                </div>
              ) : null}
            </div>
            {isPersonalAccessToken ? (
              <span className="api-oauth-binding">
                <span>
                  <ShieldCheck size={14} />
                  可切换，不支持额度刷新
                </span>
              </span>
            ) : (
              <span className="api-oauth-binding">
                <span>
                  <ShieldCheck size={14} />
                  OAuth {boundOAuthAccount ? '已绑定' : '未绑定'}
                </span>
                <button type="button" onClick={() => onBindOAuthAccount(account)}>
                  <Link2 size={13} />
                  <span>{getOAuthBindingText(boundOAuthAccount)}</span>
                </button>
              </span>
            )}
          </>
        ) : (
          <div className="account-health-slot">
            {hasQuotaError && quotaErrorSummary ? (
              <div className="account-detail-error" role="alert">
                <span className="account-detail-error-body">
                  <strong>{quotaErrorSummary.title}</strong>
                  <span>{quotaErrorSummary.action}</span>
                </span>
                {canReauthenticate ? (
                  <span className="account-detail-error-actions">
                    <Button variant="secondary" icon={<KeyRound size={14} />} onClick={() => onReauthenticate(account.id)}>
                      重新授权
                    </Button>
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="quota-lines">
                <span className="quota-line">
                  <span>
                    <Clock3 size={16} />
                    5h
                  </span>
                  <strong>{quotaUnsupported ? 'API' : formatQuotaLabel(hourly)}</strong>
                </span>
                <span className="quota-track">
                  <span style={{ width: `${quotaUnsupported ? 100 : normalizedHourly}%` }} />
                </span>
                <span className="quota-line">
                  <span>
                    <CalendarDays size={16} />
                    7d
                  </span>
                  <strong>{quotaUnsupported ? '可用' : formatQuotaLabel(weekly)}</strong>
                </span>
                <span className="quota-track">
                  <span style={{ width: `${quotaUnsupported ? 100 : normalizedWeekly}%` }} />
                </span>
                <button
                  type="button"
                  className={`reset-credit-panel ${resetCreditItems.length === 0 ? 'empty' : ''}`}
                  disabled={resetCreditItems.length === 0}
                  aria-label={
                    resetCreditTotal === null
                      ? '重置机会，到期时间需要刷新后显示'
                      : `重置机会，${resetCreditTotal} 次可用，查看到期时间`
                  }
                  onClick={() => setShowResetCreditsModal(true)}
                >
                  <span className="reset-credit-summary">
                    <span>
                      <RotateCcw size={14} />
                      重置机会
                    </span>
                    <strong>
                      <span>{resetCreditTotal === null ? '-' : resetCreditTotal}</span>
                      次可用
                    </strong>
                  </span>
                  <span className="reset-credit-hint">{resetCreditItems.length > 0 ? '点击查看到期时间' : resetCreditEmptyText}</span>
                </button>
              </span>
            )}
          </div>
        )}

        {!quotaUnsupported ? (
          <span className="account-validity">
            <span>
              <CalendarDays size={15} />
              {validityDisplay.label}
            </span>
            {validityDisplay.detail ? <span>{validityDisplay.detail}</span> : null}
          </span>
        ) : null}
      </div>

      <div className="account-card-actions">
        <IconButton
          label={account.isCurrent ? '当前账号' : '切换账号'}
          icon={switching ? <RefreshCw className="spin-icon" size={16} /> : <Play size={16} />}
          active={account.isCurrent}
          disabled={account.isCurrent || switching}
          onClick={() => onSwitch(account.id)}
        />
        {!quotaUnsupported ? (
          <IconButton
            label="刷新额度"
            icon={refreshing ? <RefreshCw className="spin-icon" size={16} /> : <RefreshCw size={16} />}
            disabled={refreshing}
            onClick={() => onRefreshQuota(account.id)}
          />
        ) : null}
        {quotaUnsupported && !isPersonalAccessToken ? (
          <IconButton label="编辑 API 账号" icon={<Pencil size={16} />} onClick={() => onEditApiAccount(account)} />
        ) : null}
        <IconButton
          label="删除账号"
          icon={deleting ? <RefreshCw className="spin-icon" size={16} /> : <Trash2 size={16} />}
          disabled={deleting}
          onClick={() => onDelete(account.id)}
        />
      </div>
      <Modal
        open={showResetCreditsModal}
        onClose={() => setShowResetCreditsModal(false)}
        title="重置机会到期时间"
        size="md"
      >
        <div className="reset-credit-modal">
          <div className="reset-credit-modal-summary">
            <span>当前账号</span>
            <strong>{account.email ?? account.displayName}</strong>
            <em>{resetCreditTotal === null ? '-' : resetCreditTotal} 次可用</em>
          </div>
          <div className="reset-credit-modal-list" aria-label="全部重置机会到期时间">
            {resetCreditItems.map((credit, index) => (
              <ResetCreditExpiryItem
                key={`${credit.expiresAt ?? 'unknown'}-${index}`}
                credit={credit}
                index={index}
                variant="modal"
              />
            ))}
            {missingResetCreditExpiryCount > 0 ? (
              <span className="reset-credit-more">{missingResetCreditExpiryCount} 次未返回到期时间</span>
            ) : null}
          </div>
        </div>
      </Modal>
    </article>
  );
}
