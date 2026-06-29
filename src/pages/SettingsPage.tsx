import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Download, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel/Panel';
import { Tabs, type Tab } from '../components/ui/Tabs/Tabs';
import { openDataDir, openLogDir } from '../services/systemService';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUpdateStore } from '../stores/useUpdateStore';
import type { AppSettings, SystemSnapshot } from '../types/system';

const pathRows: Array<{ label: string; key: keyof SystemSnapshot }> = [
  { label: '应用数据', key: 'appDataDir' },
  { label: '日志目录', key: 'logsDir' },
  { label: '账号文件', key: 'accountsFilePath' },
  { label: '设置文件', key: 'settingsFilePath' },
  { label: 'Codex Home', key: 'defaultCodexHome' },
  { label: 'Codex Auth', key: 'defaultCodexAuthFile' },
];

type SettingsTab = 'about' | 'codex' | 'local';

const settingsTabs: Tab[] = [
  { id: 'about', label: '关于' },
  { id: 'codex', label: 'Codex 设置' },
  { id: 'local', label: '本地信息' },
];

const projectUrl = 'https://github.com/izz520/Nuomi-Switch';
const authorUrl = 'https://github.com/izz520';

export function SettingsPage() {
  const {
    snapshot,
    settings,
    error,
    loading,
    saving,
    detecting,
    loadSnapshot,
    loadSettings,
    saveSettings,
    detectPaths,
  } = useSettingsStore();
  const { appVersion, updateStatus, updateInfo, updateError, loadAppVersion, checkUpdate } = useUpdateStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('about');
  const [quotaSettingsDraft, setQuotaSettingsDraft] = useState<
    Pick<AppSettings, 'quotaAutoRefreshEnabled' | 'quotaAutoRefreshIntervalMinutes'> | null
  >(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadSnapshot();
    void loadSettings();
  }, [loadSettings, loadSnapshot]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setQuotaSettingsDraft({
      quotaAutoRefreshEnabled: settings.quotaAutoRefreshEnabled,
      quotaAutoRefreshIntervalMinutes: settings.quotaAutoRefreshIntervalMinutes,
    });
  }, [settings]);

  useEffect(() => {
    void loadAppVersion();
  }, [loadAppVersion]);

  async function handleSaveQuotaSettings() {
    if (!settings || !quotaSettingsDraft) {
      return;
    }

    setSettingsNotice(null);
    await saveSettings({
      ...settings,
      quotaAutoRefreshEnabled: quotaSettingsDraft.quotaAutoRefreshEnabled,
      quotaAutoRefreshIntervalMinutes: Math.max(5, Math.round(quotaSettingsDraft.quotaAutoRefreshIntervalMinutes)),
    });
    setSettingsNotice('自动额度刷新设置已保存。');
  }

  const quotaSettingsChanged =
    Boolean(settings && quotaSettingsDraft) &&
    (settings?.quotaAutoRefreshEnabled !== quotaSettingsDraft?.quotaAutoRefreshEnabled ||
      settings?.quotaAutoRefreshIntervalMinutes !== quotaSettingsDraft?.quotaAutoRefreshIntervalMinutes);

  return (
    <div className="content">
      <div className="settings-tabs">
        <Tabs tabs={settingsTabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as SettingsTab)} />
      </div>

      {activeTab === 'about' ? (
        <Panel>
          <div className="settings-about-header">
            <img src="/nuomi-logo.png" alt="Nuomi Switch" />
            <div>
              <h2 className="section-title">Nuomi Switch</h2>
              <p className="muted">
                本地优先的桌面账号管理工具，用来管理 Codex 和 Claude 账号、切换本机配置、刷新 Codex 额度，并尽量把手动编辑授权文件这类容易出错的操作收拢到清晰可恢复的界面里。
              </p>
            </div>
          </div>

          <div className="settings-grid">
            <div className="settings-row">
              <span>项目地址</span>
              <button className="settings-link-button" type="button" onClick={() => void openUrl(projectUrl)}>
                izz520/Nuomi-Switch <ExternalLink size={14} />
              </button>
            </div>
            <div className="settings-row">
              <span>作者</span>
              <button className="settings-link-button" type="button" onClick={() => void openUrl(authorUrl)}>
                github.com/izz520 <ExternalLink size={14} />
              </button>
            </div>
            <div className="settings-row">
              <span>软件版本</span>
              <strong>v{appVersion}</strong>
            </div>
          </div>

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
            <Button variant="secondary" loading={updateStatus === 'checking'} icon={<RefreshCw />} onClick={() => void checkUpdate()}>
              检查更新
            </Button>
          </div>
        </Panel>
      ) : activeTab === 'local' ? (
        <Panel>
          <h2 className="section-title">本地信息</h2>
          <p className="muted">当前设备上的应用数据、账号文件、设置文件和 Codex 默认路径。</p>
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
            </div>
          ) : (
            <p className="muted">{loading ? '正在加载本地路径...' : '还没有加载本地路径快照。'}</p>
          )}
          <div className="toolbar-actions">
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
      ) : (
        <Panel>
          <h2 className="section-title">Codex 设置</h2>
          <p className="muted">自动刷新全部 OAuth 账号的 5 小时额度、7 天额度和重置次数。</p>
          {quotaSettingsDraft ? (
            <div className="settings-grid quota-settings-grid">
              <label className="settings-row settings-control-row">
                <span>自动刷新额度</span>
                <input
                  className="settings-switch"
                  type="checkbox"
                  checked={quotaSettingsDraft.quotaAutoRefreshEnabled}
                  onChange={(event) => {
                    setSettingsNotice(null);
                    setQuotaSettingsDraft((draft) =>
                      draft ? { ...draft, quotaAutoRefreshEnabled: event.target.checked } : draft,
                    );
                  }}
                />
              </label>
              <label className="settings-row settings-control-row">
                <span>自动刷新间隔</span>
                <span className="settings-number-control">
                  <input
                    min={5}
                    step={5}
                    type="number"
                    value={quotaSettingsDraft.quotaAutoRefreshIntervalMinutes}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      setSettingsNotice(null);
                      setQuotaSettingsDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              quotaAutoRefreshIntervalMinutes: Number.isFinite(nextValue) ? nextValue : 5,
                            }
                          : draft,
                      );
                    }}
                  />
                  <small>分钟</small>
                </span>
              </label>
            </div>
          ) : (
            <p className="muted">{loading ? '正在加载额度刷新设置...' : '还没有加载额度刷新设置。'}</p>
          )}
          {settingsNotice ? <p className="account-switch-notice">{settingsNotice}</p> : null}
          <div className="toolbar-actions">
            <Button
              variant="primary"
              icon={<Save />}
              loading={saving}
              disabled={!quotaSettingsChanged || !quotaSettingsDraft}
              onClick={() => void handleSaveQuotaSettings()}
            >
              保存额度刷新设置
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
