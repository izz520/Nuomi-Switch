import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel/Panel';
import { openDataDir, openLogDir } from '../services/systemService';
import { checkForUpdate, getAppVersion, getUpdateManifestUrl, type UpdateInfo, type UpdateStatus } from '../services/updateService';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { SystemSnapshot } from '../types/system';

const pathRows: Array<{ label: string; key: keyof SystemSnapshot }> = [
  { label: '应用数据', key: 'appDataDir' },
  { label: '日志目录', key: 'logsDir' },
  { label: '账号文件', key: 'accountsFilePath' },
  { label: '设置文件', key: 'settingsFilePath' },
  { label: 'Codex Home', key: 'defaultCodexHome' },
  { label: 'Codex Auth', key: 'defaultCodexAuthFile' },
];

export function SettingsPage() {
  const { snapshot, error, loading, detecting, loadSnapshot, detectPaths } = useSettingsStore();
  const [appVersion, setAppVersion] = useState<string>('...');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    void getAppVersion().then(setAppVersion).catch(() => setAppVersion('未知'));
  }, []);

  async function handleCheckUpdate() {
    const manifestUrl = getUpdateManifestUrl();
    if (!manifestUrl) {
      setUpdateStatus('unconfigured');
      setUpdateInfo(null);
      setUpdateError(null);
      return;
    }

    setUpdateStatus('checking');
    setUpdateInfo(null);
    setUpdateError(null);
    try {
      const currentVersion = appVersion === '...' || appVersion === '未知' ? await getAppVersion() : appVersion;
      const nextUpdate = await checkForUpdate(currentVersion);
      setUpdateInfo(nextUpdate);
      setUpdateStatus(nextUpdate ? 'available' : 'current');
    } catch (updateCheckError) {
      setUpdateStatus('error');
      setUpdateError(updateCheckError instanceof Error ? updateCheckError.message : '检查更新失败。');
    }
  }

  return (
    <div className="content">
      <Panel>
        <h2 className="section-title">设置</h2>
        <p className="muted">本地路径和隐私相关配置，仅在当前设备生效。</p>
        {error ? <p className="muted">{error.message}</p> : null}
        {snapshot ? (
          <div className="settings-grid">
            {pathRows.map((row) => (
              <div className="settings-row" key={row.key}>
                <span>{row.label}</span>
                <code>{String(snapshot[row.key])}</code>
              </div>
            ))}
            <div className="settings-row">
              <span>Auth 文件状态</span>
              <strong>{snapshot.codexAuthFileExists ? '已找到' : '缺失'}</strong>
            </div>
            <div className="settings-row">
              <span>软件版本</span>
              <strong>v{appVersion}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">{loading ? '正在加载本地路径...' : '还没有加载本地路径快照。'}</p>
        )}
        <div className={`update-status update-status-${updateStatus}`} role="status">
          {updateStatus === 'available' && updateInfo ? (
            <>
              <div>
                <strong>发现新版本 v{updateInfo.version}</strong>
                {updateInfo.notes ? <p>{updateInfo.notes}</p> : null}
              </div>
              <Button variant="primary" icon={<Download />} onClick={() => void openUrl(updateInfo.releaseUrl)}>
                获取更新
              </Button>
            </>
          ) : (
            <span>
              {updateStatus === 'checking'
                ? '正在检查更新...'
                : updateStatus === 'current'
                  ? '当前已是最新版本。'
                  : updateStatus === 'unconfigured'
                    ? '尚未配置更新清单地址。'
                    : updateStatus === 'error'
                      ? updateError
                      : '可以手动检查是否有新版本。'}
            </span>
          )}
        </div>
        <div className="toolbar-actions">
          <Button variant="secondary" loading={updateStatus === 'checking'} icon={<RefreshCw />} onClick={() => void handleCheckUpdate()}>
            检查更新
          </Button>
          <Button variant="secondary" loading={detecting} onClick={() => void detectPaths()}>
            检测 Codex 路径
          </Button>
          <Button variant="secondary" onClick={() => void openDataDir()}>
            打开数据目录
          </Button>
          <Button variant="secondary" onClick={() => void openLogDir()}>
            打开日志
          </Button>
        </div>
      </Panel>
    </div>
  );
}
