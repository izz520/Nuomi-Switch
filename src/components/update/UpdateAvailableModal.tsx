import { CheckCircle2, Download, RefreshCw, Sparkles } from 'lucide-react';
import { useUpdateStore } from '../../stores/useUpdateStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal/Modal';
import './UpdateAvailableModal.css';

export function UpdateAvailableModal() {
  const {
    appVersion,
    updateInfo,
    updateStatus,
    updateProgress,
    updateModalDismissed,
    dismissUpdateModal,
    installUpdateAndRestart,
  } = useUpdateStore();
  const isUpdating = updateStatus === 'downloading' || updateStatus === 'installing' || updateStatus === 'installed';
  const open = Boolean(updateInfo) && (updateStatus === 'available' || isUpdating) && !updateModalDismissed;
  const progressLabel = formatProgressLabel(updateProgress?.downloadedBytes ?? 0, updateProgress?.totalBytes ?? null);
  const versionFrom = updateInfo?.currentVersion || appVersion;

  return (
    <Modal
      open={open}
      onClose={isUpdating ? () => undefined : dismissUpdateModal}
      title="发现新版本"
      size="sm"
      showCloseButton={!isUpdating}
      footer={
        isUpdating ? (
          <Button
            variant="primary"
            icon={updateStatus === 'installed' ? <CheckCircle2 size={16} /> : undefined}
            loading={updateStatus !== 'installed'}
            disabled
          >
            {updateStatus === 'installed' ? '正在重启' : '正在更新'}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={dismissUpdateModal}>
              稍后再说
            </Button>
            <Button variant="primary" icon={<Download size={16} />} onClick={() => void installUpdateAndRestart()}>
              安装并重启
            </Button>
          </>
        )
      }
    >
      <div className="update-modal-content">
        <div className="update-modal-icon" aria-hidden="true">
          {isUpdating ? <RefreshCw size={22} /> : <Sparkles size={22} />}
        </div>
        <div>
          <p className="update-modal-version">
            v{versionFrom} <span>→</span> v{updateInfo?.version}
          </p>
          {updateInfo?.notes ? <p className="update-modal-notes">{updateInfo.notes}</p> : null}
          {isUpdating ? (
            <div className="update-modal-progress" role="status" aria-live="polite">
              <div className="update-progress-track" aria-hidden="true">
                <div
                  className={`update-progress-bar ${updateProgress?.percent == null ? 'update-progress-bar-indeterminate' : ''}`}
                  style={{ width: `${updateProgress?.percent ?? 28}%` }}
                />
              </div>
              <p className="update-progress-label">
                {updateStatus === 'downloading'
                  ? `正在下载${progressLabel ? `，${progressLabel}` : ''}`
                  : updateStatus === 'installing'
                    ? '正在安装更新'
                    : '更新已安装，正在重启应用'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function formatProgressLabel(downloadedBytes: number, totalBytes: number | null): string {
  if (!downloadedBytes && !totalBytes) {
    return '';
  }

  const downloaded = formatBytes(downloadedBytes);
  return totalBytes ? `${downloaded} / ${formatBytes(totalBytes)}` : downloaded;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = value >= 10 || exponent === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
}
