import './QuotaMeter.css';
import type { AppError } from '../../types/system';

interface QuotaMeterProps {
  error?: AppError | null;
  label: string;
  loading?: boolean;
  resetAt?: string | null;
  stale?: boolean;
  unsupported?: boolean;
  value?: number | null;
}

function getTone(value?: number | null): string {
  if (typeof value !== 'number') {
    return 'unknown';
  }
  if (value >= 40) {
    return 'success';
  }
  if (value >= 15) {
    return 'warning';
  }
  return 'error';
}

function getStatusText({
  error,
  loading,
  resetAt,
  stale,
  unsupported,
  value,
}: Pick<QuotaMeterProps, 'error' | 'loading' | 'resetAt' | 'stale' | 'unsupported' | 'value'>): string {
  if (loading) {
    return '刷新中';
  }
  if (unsupported) {
    return '不支持';
  }
  if (error) {
    return stale && typeof value === 'number' ? '刷新失败，显示旧数据' : '刷新失败';
  }
  if (stale) {
    return '旧数据';
  }
  if (resetAt) {
    return `${resetAt} 重置`;
  }
  if (typeof value !== 'number') {
    return '未知';
  }
  return '最新';
}

export function QuotaMeter({ error, label, loading = false, resetAt, stale = false, unsupported = false, value }: QuotaMeterProps) {
  const normalized = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
  const tone = unsupported || error ? 'unknown' : getTone(value);
  const text = loading ? '...' : typeof value === 'number' ? `${normalized}%` : '未知';
  const statusText = getStatusText({ error, loading, resetAt, stale, unsupported, value });

  return (
    <div className={`quota-meter ${loading ? 'quota-meter-loading' : ''}`}>
      <div className="quota-meter-label">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div className="quota-meter-track">
        <div className={`quota-meter-fill quota-${tone}`} style={{ width: `${normalized}%` }} />
      </div>
      <div className="quota-meter-status">{statusText}</div>
    </div>
  );
}
