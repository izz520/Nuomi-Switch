import { create } from 'zustand';
import { detectCodexPaths, getSettings, getSystemSnapshot, saveSettings } from '../services/systemService';
import type { AppError, AppSettings, SystemSnapshot } from '../types/system';
import { normalizeInvokeError } from '../services/tauriInvoke';

interface SettingsState {
  snapshot: SystemSnapshot | null;
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  detecting: boolean;
  error: AppError | null;
  loadSnapshot: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  detectPaths: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  snapshot: null,
  settings: null,
  loading: false,
  saving: false,
  detecting: false,
  error: null,
  async loadSnapshot() {
    set({ loading: true, error: null });
    try {
      set({ snapshot: await getSystemSnapshot(), loading: false });
    } catch (error) {
      set({ error: normalizeInvokeError(error), loading: false });
    }
  },
  async loadSettings() {
    set({ loading: true, error: null });
    try {
      set({ settings: await getSettings(), loading: false });
    } catch (error) {
      set({ error: normalizeInvokeError(error), loading: false });
    }
  },
  async saveSettings(settings) {
    set({ saving: true, error: null });
    try {
      set({ settings: await saveSettings(settings), saving: false });
    } catch (error) {
      set({ error: normalizeInvokeError(error), saving: false });
      throw error;
    }
  },
  async detectPaths() {
    set({ detecting: true, error: null });
    try {
      const settings = await detectCodexPaths();
      set({ snapshot: await getSystemSnapshot(), settings, detecting: false });
    } catch (error) {
      set({ error: normalizeInvokeError(error), detecting: false });
    }
  },
}));
