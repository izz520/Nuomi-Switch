import { create } from 'zustand';
import {
  canUseNativeUpdater,
  checkForUpdate,
  downloadAndInstallUpdate,
  getAppVersion,
  relaunchApp,
  type UpdateInfo,
  type UpdateProgress,
  type UpdateStatus,
} from '../services/updateService';

interface UpdateState {
  appVersion: string;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateProgress: UpdateProgress | null;
  updateError: string | null;
  startupChecked: boolean;
  updateModalDismissed: boolean;
  loadAppVersion: () => Promise<string>;
  checkUpdate: () => Promise<void>;
  checkStartupUpdate: () => Promise<void>;
  installUpdateAndRestart: () => Promise<void>;
  dismissUpdateModal: () => void;
}

const busyStatuses: UpdateStatus[] = ['checking', 'downloading', 'installing', 'installed'];

export const useUpdateStore = create<UpdateState>((set, get) => ({
  appVersion: '...',
  updateStatus: 'idle',
  updateInfo: null,
  updateProgress: null,
  updateError: null,
  startupChecked: false,
  updateModalDismissed: false,
  async loadAppVersion() {
    const existing = get().appVersion;
    if (existing !== '...' && existing !== '未知') {
      return existing;
    }

    try {
      const appVersion = await getAppVersion();
      set({ appVersion });
      return appVersion;
    } catch {
      set({ appVersion: '未知' });
      return '未知';
    }
  },
  async checkUpdate() {
    if (!canUseNativeUpdater()) {
      set({
        updateStatus: 'unconfigured',
        updateInfo: null,
        updateProgress: null,
        updateError: null,
      });
      return;
    }

    set({ updateStatus: 'checking', updateInfo: null, updateProgress: null, updateError: null });
    try {
      await get().loadAppVersion();
      const updateInfo = await checkForUpdate();
      set({
        updateInfo,
        updateProgress: null,
        updateStatus: updateInfo ? 'available' : 'current',
        updateModalDismissed: false,
      });
    } catch (error) {
      set({
        updateStatus: 'error',
        updateProgress: null,
        updateError: error instanceof Error ? error.message : '检查更新失败。',
      });
    }
  },
  async checkStartupUpdate() {
    if (get().startupChecked) {
      return;
    }

    set({ startupChecked: true });
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('mockUpdate') === '1') {
      set({
        appVersion: '0.2.2',
        updateStatus: 'available',
        updateInfo: {
          version: '0.3.0',
          currentVersion: '0.2.2',
          notes: '模拟更新：优化 Codex 额度自动刷新、设置页信息架构和启动检查体验。',
          publishedAt: new Date().toISOString(),
        },
        updateProgress: null,
        updateError: null,
        updateModalDismissed: false,
      });
      return;
    }

    await get().checkUpdate();
  },
  async installUpdateAndRestart() {
    if (!get().updateInfo || busyStatuses.includes(get().updateStatus)) {
      return;
    }

    const isMockUpdate = import.meta.env.DEV && new URLSearchParams(window.location.search).get('mockUpdate') === '1';
    set({ updateStatus: 'downloading', updateProgress: null, updateError: null, updateModalDismissed: false });

    try {
      if (isMockUpdate) {
        set({
          updateProgress: {
            downloadedBytes: 1,
            totalBytes: 1,
            percent: 100,
            finished: true,
          },
          updateStatus: 'installed',
        });
        return;
      }

      await downloadAndInstallUpdate((progress) => {
        set({
          updateProgress: progress,
          updateStatus: progress.finished ? 'installing' : 'downloading',
        });
      });

      set({ updateStatus: 'installed', updateProgress: get().updateProgress });
      await relaunchApp();
    } catch (error) {
      set({
        updateStatus: 'error',
        updateError: error instanceof Error ? error.message : '安装更新失败。',
      });
    }
  },
  dismissUpdateModal() {
    if (busyStatuses.includes(get().updateStatus)) {
      return;
    }

    set({ updateModalDismissed: true });
  },
}));
