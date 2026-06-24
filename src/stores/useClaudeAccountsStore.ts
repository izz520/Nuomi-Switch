import { create } from 'zustand';
import type {
  ClaudeAccountView,
  ClaudeApiKeyInput,
  ClaudeCurrentAccounts,
  ClaudeDesktopGatewayInput,
  ClaudeDesktopJsonImportInput,
} from '../types/claude';
import type { AppError } from '../types/system';
import {
  completeClaudeOauthLogin,
  deleteClaudeAccount,
  getCurrentClaudeAccounts,
  importClaudeApiKey,
  importClaudeCliFromLocal,
  importClaudeDesktopFromLocal,
  importClaudeDesktopGateway,
  importClaudeDesktopJson,
  importClaudeDesktopJsonFile,
  listClaudeAccounts,
  prepareClaudeOauthLogin,
  switchClaudeAccount,
  updateClaudeApiKey,
  updateClaudeDesktopGateway,
} from '../services/claudeAccountService';

interface ClaudeAccountsState {
  accounts: ClaudeAccountView[];
  currentAccounts: ClaudeCurrentAccounts;
  loading: boolean;
  switchingAccountId: string | null;
  deletingAccountId: string | null;
  saving: boolean;
  lastSwitchNotice: string | null;
  oauthAuthorizeUrl: string | null;
  oauthLoginId: string | null;
  error: AppError | null;
  loadAccounts: () => Promise<void>;
  importDesktopFromLocal: () => Promise<ClaudeAccountView>;
  importCliFromLocal: () => Promise<ClaudeAccountView>;
  addDesktopGateway: (input: ClaudeDesktopGatewayInput) => Promise<ClaudeAccountView>;
  addDesktopJson: (input: ClaudeDesktopJsonImportInput) => Promise<ClaudeAccountView>;
  addDesktopJsonFile: (filePath: string) => Promise<ClaudeAccountView>;
  saveDesktopGateway: (accountId: string, input: ClaudeDesktopGatewayInput) => Promise<ClaudeAccountView>;
  addApiKey: (input: ClaudeApiKeyInput) => Promise<ClaudeAccountView>;
  saveApiKey: (accountId: string, input: ClaudeApiKeyInput) => Promise<ClaudeAccountView>;
  beginCliOauth: () => Promise<void>;
  finishCliOauth: (callbackOrCode: string, emailHint?: string) => Promise<ClaudeAccountView>;
  switchAccount: (accountId: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  clearOauthDraft: () => void;
}

function mergeAccount(accounts: ClaudeAccountView[], updated: ClaudeAccountView): ClaudeAccountView[] {
  const index = accounts.findIndex((account) => account.id === updated.id);
  if (index === -1) {
    return [updated, ...accounts];
  }
  return accounts.map((account) => (account.id === updated.id ? updated : account));
}

export const useClaudeAccountsStore = create<ClaudeAccountsState>((set, get) => ({
  accounts: [],
  currentAccounts: {},
  loading: false,
  switchingAccountId: null,
  deletingAccountId: null,
  saving: false,
  lastSwitchNotice: null,
  oauthAuthorizeUrl: null,
  oauthLoginId: null,
  error: null,
  async loadAccounts() {
    set({ loading: true, error: null });
    try {
      const [accounts, currentAccounts] = await Promise.all([listClaudeAccounts(), getCurrentClaudeAccounts()]);
      set({ accounts, currentAccounts, loading: false });
    } catch (error) {
      set({ error: error as AppError, loading: false });
    }
  },
  async importDesktopFromLocal() {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeDesktopFromLocal();
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async importCliFromLocal() {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeCliFromLocal();
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async addDesktopGateway(input) {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeDesktopGateway(input);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async addDesktopJson(input) {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeDesktopJson(input);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async addDesktopJsonFile(filePath) {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeDesktopJsonFile(filePath);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async saveDesktopGateway(accountId, input) {
    set({ saving: true, error: null });
    try {
      const account = await updateClaudeDesktopGateway(accountId, input);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async addApiKey(input) {
    set({ saving: true, error: null });
    try {
      const account = await importClaudeApiKey(input);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async saveApiKey(accountId, input) {
    set({ saving: true, error: null });
    try {
      const account = await updateClaudeApiKey(accountId, input);
      set((state) => ({ accounts: mergeAccount(state.accounts, account), saving: false }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async beginCliOauth() {
    set({ saving: true, error: null, oauthAuthorizeUrl: null, oauthLoginId: null });
    try {
      const result = await prepareClaudeOauthLogin();
      set({
        saving: false,
        oauthAuthorizeUrl: result.authorizeUrl,
        oauthLoginId: result.loginId,
      });
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async finishCliOauth(callbackOrCode, emailHint) {
    const loginId = get().oauthLoginId;
    if (!loginId) {
      const error: AppError = {
        code: 'CLAUDE_OAUTH_NOT_STARTED',
        message: '尚未开始 Claude OAuth 登录。',
        action: '先点击开始 OAuth 登录。',
        retryable: false,
      };
      set({ error });
      throw error;
    }
    set({ saving: true, error: null });
    try {
      const account = await completeClaudeOauthLogin(loginId, callbackOrCode, emailHint);
      set((state) => ({
        accounts: mergeAccount(state.accounts, account),
        saving: false,
        oauthAuthorizeUrl: null,
        oauthLoginId: null,
      }));
      return account;
    } catch (error) {
      set({ error: error as AppError, saving: false });
      throw error;
    }
  },
  async switchAccount(accountId) {
    set({ switchingAccountId: accountId, error: null, lastSwitchNotice: null });
    try {
      const result = await switchClaudeAccount(accountId);
      set((state) => ({
        accounts: state.accounts.map((account) => ({
          ...account,
          isCurrent: account.id === result.account.id,
        })),
        currentAccounts: result.currentAccounts,
        switchingAccountId: null,
        lastSwitchNotice: result.warnings.join(' '),
      }));
    } catch (error) {
      set({ error: error as AppError, switchingAccountId: null });
      throw error;
    }
  },
  async removeAccount(accountId) {
    set({ deletingAccountId: accountId, error: null });
    try {
      await deleteClaudeAccount(accountId);
      set((state) => ({
        accounts: state.accounts.filter((account) => account.id !== accountId),
        deletingAccountId: null,
      }));
    } catch (error) {
      set({ error: error as AppError, deletingAccountId: null });
      throw error;
    }
  },
  clearOauthDraft() {
    set({ oauthAuthorizeUrl: null, oauthLoginId: null });
  },
}));
