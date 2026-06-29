import { create } from 'zustand';
import {
  checkForUpdate,
  getAppVersion,
  getUpdateManifestUrl,
  type UpdateInfo,
  type UpdateStatus,
} from '../services/updateService';

interface UpdateState {
  appVersion: string;
  updateStatus: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updateError: string | null;
  startupChecked: boolean;
  updateModalDismissed: boolean;
  loadAppVersion: () => Promise<string>;
  checkUpdate: () => Promise<void>;
  checkStartupUpdate: () => Promise<void>;
  dismissUpdateModal: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  appVersion: '...',
  updateStatus: 'idle',
  updateInfo: null,
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
    const manifestUrl = getUpdateManifestUrl();
    if (!manifestUrl) {
      set({
        updateStatus: 'unconfigured',
        updateInfo: null,
        updateError: null,
      });
      return;
    }

    set({ updateStatus: 'checking', updateInfo: null, updateError: null });
    try {
      const currentVersion = await get().loadAppVersion();
      const normalizedCurrentVersion = currentVersion === '未知' ? await getAppVersion() : currentVersion;
      const updateInfo = await checkForUpdate(normalizedCurrentVersion);
      set({
        updateInfo,
        updateStatus: updateInfo ? 'available' : 'current',
      });
    } catch (error) {
      set({
        updateStatus: 'error',
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
          releaseUrl: 'https://github.com/izz520/Nuomi-Switch/releases',
          notes: '模拟更新：优化 Codex 额度自动刷新、设置页信息架构和启动检查体验。',
          publishedAt: new Date().toISOString(),
        },
        updateError: null,
        updateModalDismissed: false,
      });
      return;
    }

    await get().checkUpdate();
  },
  dismissUpdateModal() {
    set({ updateModalDismissed: true });
  },
}));
