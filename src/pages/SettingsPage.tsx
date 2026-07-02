import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Cable, CheckCircle2, Download, ExternalLink, RefreshCw, Save } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel/Panel';
import { Tabs, type Tab } from '../components/ui/Tabs/Tabs';
import { openDataDir, openLogDir } from '../services/systemService';
import { normalizeInvokeError } from '../services/tauriInvoke';
import {
  getWorkingLightHookStatus,
  getWorkingLightSnapshot,
  installWorkingLightHooks,
  setWorkingLightAgentEnabled,
  setWorkingLightMuted,
  setWorkingLightWindowEnabled,
} from '../services/workingLightService';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUpdateStore } from '../stores/useUpdateStore';
import type { AppSettings, SystemSnapshot } from '../types/system';
import type { WorkingLightAgent, WorkingLightHookStatus, WorkingLightPreferences } from '../types/workingLight';

const pathRows: Array<{ label: string; key: keyof SystemSnapshot }> = [
  { label: '应用数据', key: 'appDataDir' },
  { label: '日志目录', key: 'logsDir' },
  { label: '账号文件', key: 'accountsFilePath' },
  { label: '设置文件', key: 'settingsFilePath' },
  { label: 'Codex Home', key: 'defaultCodexHome' },
  { label: 'Codex Auth', key: 'defaultCodexAuthFile' },
];

type SettingsTab = 'about' | 'codex' | 'floating' | 'local';

const settingsTabs: Tab[] = [
  { id: 'about', label: '关于' },
  { id: 'codex', label: 'Codex 设置' },
  { id: 'floating', label: '悬浮窗' },
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
  const {
    appVersion,
    updateStatus,
    updateInfo,
    updateProgress,
    updateError,
    loadAppVersion,
    checkUpdate,
    installUpdateAndRestart,
  } = useUpdateStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('about');
  const [quotaSettingsDraft, setQuotaSettingsDraft] = useState<
    Pick<AppSettings, 'quotaAutoRefreshEnabled' | 'quotaAutoRefreshIntervalMinutes'> | null
  >(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [workingLightPreferences, setWorkingLightPreferences] = useState<WorkingLightPreferences | null>(null);
  const [workingLightHookStatus, setWorkingLightHookStatus] = useState<WorkingLightHookStatus | null>(null);
  const [workingLightLoading, setWorkingLightLoading] = useState(false);
  const [workingLightSavingAgent, setWorkingLightSavingAgent] = useState<WorkingLightAgent | null>(null);
  const [workingLightSavingMuted, setWorkingLightSavingMuted] = useState(false);
  const [workingLightSavingWindow, setWorkingLightSavingWindow] = useState(false);
  const [workingLightInstallingAgent, setWorkingLightInstallingAgent] = useState<WorkingLightAgent | null>(null);
  const [workingLightError, setWorkingLightError] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeTab === 'floating' && !workingLightPreferences) {
      void loadWorkingLightPreferences();
    }
  }, [activeTab, workingLightPreferences]);

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

  async function loadWorkingLightPreferences() {
    setWorkingLightLoading(true);
    setWorkingLightError(null);
    try {
      const [snapshot, hookStatus] = await Promise.all([getWorkingLightSnapshot(), getWorkingLightHookStatus()]);
      setWorkingLightPreferences(snapshot.preferences);
      setWorkingLightHookStatus(hookStatus);
    } catch (error) {
      const appError = normalizeInvokeError(error);
      setWorkingLightError(appError.message);
    } finally {
      setWorkingLightLoading(false);
    }
  }

  async function handleWorkingLightAgentToggle(agent: WorkingLightAgent, enabled: boolean) {
    setWorkingLightSavingAgent(agent);
    setWorkingLightError(null);
    try {
      const preferences = await setWorkingLightAgentEnabled(agent, enabled);
      setWorkingLightPreferences(preferences);
    } catch (error) {
      const appError = normalizeInvokeError(error);
      setWorkingLightError(appError.message);
    } finally {
      setWorkingLightSavingAgent(null);
    }
  }

  async function handleWorkingLightMutedToggle(muted: boolean) {
    setWorkingLightSavingMuted(true);
    setWorkingLightError(null);
    try {
      const preferences = await setWorkingLightMuted(muted);
      setWorkingLightPreferences(preferences);
    } catch (error) {
      const appError = normalizeInvokeError(error);
      setWorkingLightError(appError.message);
    } finally {
      setWorkingLightSavingMuted(false);
    }
  }

  async function handleWorkingLightWindowToggle(enabled: boolean) {
    setWorkingLightSavingWindow(true);
    setWorkingLightError(null);
    try {
      const preferences = await setWorkingLightWindowEnabled(enabled);
      setWorkingLightPreferences(preferences);
    } catch (error) {
      const appError = normalizeInvokeError(error);
      setWorkingLightError(appError.message);
    } finally {
      setWorkingLightSavingWindow(false);
    }
  }

  async function handleInstallWorkingLightHooks(agent: WorkingLightAgent) {
    setWorkingLightInstallingAgent(agent);
    setWorkingLightError(null);
    try {
      const hookStatus = await installWorkingLightHooks(agent);
      setWorkingLightHookStatus(hookStatus);
    } catch (error) {
      const appError = normalizeInvokeError(error);
      setWorkingLightError(appError.message);
    } finally {
      setWorkingLightInstallingAgent(null);
    }
  }

  const quotaSettingsChanged =
    Boolean(settings && quotaSettingsDraft) &&
    (settings?.quotaAutoRefreshEnabled !== quotaSettingsDraft?.quotaAutoRefreshEnabled ||
      settings?.quotaAutoRefreshIntervalMinutes !== quotaSettingsDraft?.quotaAutoRefreshIntervalMinutes);
  const codexHooksInstalled = Boolean(workingLightHookStatus?.codex.installed);
  const codexHooksAuthorized = Boolean(workingLightHookStatus?.codex.authorized);
  const codexNeedsAuthorization = codexHooksInstalled && !codexHooksAuthorized;

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

          <div className={`update-status update-status-${updateStatus}`} role="status" aria-live="polite">
            {updateStatus === 'available' && updateInfo ? (
              <>
                <div>
                  <strong>发现新版本 v{updateInfo.version}</strong>
                  {updateInfo.notes ? <p>{updateInfo.notes}</p> : null}
                </div>
                <Button variant="primary" icon={<Download />} onClick={() => void installUpdateAndRestart()}>
                  安装并重启
                </Button>
              </>
            ) : updateStatus === 'downloading' || updateStatus === 'installing' || updateStatus === 'installed' ? (
              <>
                <div className="update-status-progress">
                  <strong>
                    {updateStatus === 'downloading'
                      ? '正在下载更新'
                      : updateStatus === 'installing'
                        ? '正在安装更新'
                        : '更新已安装，正在重启'}
                  </strong>
                  <div className="update-progress-track" aria-hidden="true">
                    <div
                      className={`update-progress-bar ${updateProgress?.percent == null ? 'update-progress-bar-indeterminate' : ''}`}
                      style={{ width: `${updateProgress?.percent ?? 28}%` }}
                    />
                  </div>
                  <p>{formatProgressLabel(updateProgress?.downloadedBytes ?? 0, updateProgress?.totalBytes ?? null)}</p>
                </div>
                <Button
                  variant="primary"
                  icon={updateStatus === 'installed' ? <CheckCircle2 /> : undefined}
                  loading={updateStatus !== 'installed'}
                  disabled
                >
                  {updateStatus === 'installed' ? '正在重启' : '正在更新'}
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
      ) : activeTab === 'floating' ? (
        <Panel>
          <h2 className="section-title">悬浮窗</h2>
          <p className="muted">选择哪些助手会出现在工作状态悬浮窗里，并控制状态提示音。</p>
          <div className="settings-grid quota-settings-grid">
            <div className="settings-row working-light-settings-row">
              <span>悬浮窗</span>
              <div className="working-light-settings-controls">
                <label className="working-light-switch-label">
                  <input
                    className="settings-switch"
                    type="checkbox"
                    aria-label="显示悬浮窗"
                    checked={workingLightPreferences?.windowEnabled ?? true}
                    disabled={workingLightLoading || workingLightSavingWindow}
                    onChange={(event) => void handleWorkingLightWindowToggle(event.target.checked)}
                  />
                </label>
              </div>
            </div>
            <div className="settings-row working-light-settings-row">
              <span>声音</span>
              <div className="working-light-settings-controls">
                <label className="working-light-switch-label">
                  <input
                    className="settings-switch"
                    type="checkbox"
                    aria-label="悬浮窗提示音"
                    checked={!(workingLightPreferences?.muted ?? false)}
                    disabled={workingLightLoading || workingLightSavingMuted}
                    onChange={(event) => void handleWorkingLightMutedToggle(!event.target.checked)}
                  />
                </label>
              </div>
            </div>
            <div className="settings-row working-light-settings-row">
              <span>Codex</span>
              <div className="working-light-settings-controls">
                <label className="working-light-switch-label">
                  <span>显示</span>
                  <input
                    className="settings-switch"
                    type="checkbox"
                    checked={workingLightPreferences?.codexEnabled ?? true}
                    disabled={workingLightLoading || workingLightSavingAgent === 'codex'}
                    onChange={(event) => void handleWorkingLightAgentToggle('codex', event.target.checked)}
                  />
                </label>
                <span className={`working-light-hook-status ${codexHooksInstalled ? 'installed' : 'missing'}`}>
                  {codexHooksInstalled ? '识别已安装' : '识别未安装'}
                </span>
                {codexHooksInstalled ? (
                  <span className={`working-light-hook-status ${codexHooksAuthorized ? 'authorized' : 'authorization'}`}>
                    {codexHooksAuthorized ? '已授权' : '需授权'}
                  </span>
                ) : null}
                <Button
                  className="working-light-hook-button"
                  variant="secondary"
                  loading={workingLightInstallingAgent === 'codex'}
                  disabled={workingLightLoading}
                  icon={<Cable />}
                  onClick={() => void handleInstallWorkingLightHooks('codex')}
                >
                  {codexHooksInstalled ? '重新安装识别' : '安装识别'}
                </Button>
              </div>
            </div>
            <div className="settings-row working-light-settings-row">
              <span>Claude</span>
              <div className="working-light-settings-controls">
                <label className="working-light-switch-label">
                  <span>显示</span>
                  <input
                    className="settings-switch"
                    type="checkbox"
                    checked={workingLightPreferences?.claudeEnabled ?? true}
                    disabled={workingLightLoading || workingLightSavingAgent === 'claude'}
                    onChange={(event) => void handleWorkingLightAgentToggle('claude', event.target.checked)}
                  />
                </label>
                <span className={`working-light-hook-status ${workingLightHookStatus?.claude.installed ? 'installed' : 'missing'}`}>
                  {workingLightHookStatus?.claude.installed ? '识别已安装' : '识别未安装'}
                </span>
                <Button
                  className="working-light-hook-button"
                  variant="secondary"
                  loading={workingLightInstallingAgent === 'claude'}
                  disabled={workingLightLoading}
                  icon={<Cable />}
                  onClick={() => void handleInstallWorkingLightHooks('claude')}
                >
                  {workingLightHookStatus?.claude.installed ? '重新安装识别' : '安装识别'}
                </Button>
              </div>
            </div>
          </div>
          {codexNeedsAuthorization ? (
            <div className="working-light-auth-guide" aria-label="Codex 授权方式">
              <div className="working-light-auth-guide-header">
                <span>Codex 授权方式</span>
                <small>识别已安装后，按你使用的入口完成一次授权。</small>
              </div>
              <div className="working-light-auth-methods">
                <div className="working-light-auth-method">
                  <strong>CLI</strong>
                  <p>
                    在 Codex 中运行 <code>/hooks</code>，信任 Nuomi Switch hooks。
                  </p>
                </div>
                <div className="working-light-auth-method">
                  <strong>App</strong>
                  <p>
                    在设置页进入 <code>Hooks / 钩子</code>，授权 Nuomi Switch hooks。
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {workingLightError ? <p className="muted" role="alert">{workingLightError}</p> : null}
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

function formatProgressLabel(downloadedBytes: number, totalBytes: number | null): string {
  if (!downloadedBytes && !totalBytes) {
    return '正在准备下载...';
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
