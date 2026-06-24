import type {
  ClaudeAccountView,
  ClaudeApiKeyInput,
  ClaudeCurrentAccounts,
  ClaudeDesktopGatewayInput,
  ClaudeDesktopGatewayModelsResult,
  ClaudeDesktopJsonImportInput,
  ClaudeOauthPrepareResult,
  ClaudeSwitchResult,
} from '../types/claude';
import { invokeCommand } from './tauriInvoke';

export function listClaudeAccounts(): Promise<ClaudeAccountView[]> {
  return invokeCommand('list_claude_accounts');
}

export function getCurrentClaudeAccounts(): Promise<ClaudeCurrentAccounts> {
  return invokeCommand('get_current_claude_accounts');
}

export function switchClaudeAccount(accountId: string): Promise<ClaudeSwitchResult> {
  return invokeCommand('switch_claude_account', { accountId });
}

export function deleteClaudeAccount(accountId: string): Promise<void> {
  return invokeCommand('delete_claude_account', { accountId });
}

export function importClaudeDesktopFromLocal(): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_desktop_from_local');
}

export function importClaudeCliFromLocal(): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_cli_from_local');
}

export function importClaudeDesktopGateway(input: ClaudeDesktopGatewayInput): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_desktop_gateway', { ...input });
}

export function listClaudeDesktopGatewayModels(input: {
  apiKey: string;
  apiBaseUrl: string;
  authScheme?: string | null;
}): Promise<ClaudeDesktopGatewayModelsResult> {
  return invokeCommand('claude_desktop_gateway_list_models', {
    apiKey: input.apiKey,
    apiBaseUrl: input.apiBaseUrl,
    authScheme: input.authScheme ?? null,
  });
}

export function importClaudeDesktopJson(input: ClaudeDesktopJsonImportInput): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_desktop_json', { ...input });
}

export function importClaudeDesktopJsonFile(filePath: string): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_desktop_json_file', { filePath });
}

export function updateClaudeDesktopGateway(accountId: string, input: ClaudeDesktopGatewayInput): Promise<ClaudeAccountView> {
  return invokeCommand('update_claude_desktop_gateway', { accountId, ...input });
}

export function importClaudeApiKey(input: ClaudeApiKeyInput): Promise<ClaudeAccountView> {
  return invokeCommand('import_claude_api_key', { ...input });
}

export function updateClaudeApiKey(accountId: string, input: ClaudeApiKeyInput): Promise<ClaudeAccountView> {
  return invokeCommand('update_claude_api_key', { accountId, ...input });
}

export function prepareClaudeOauthLogin(): Promise<ClaudeOauthPrepareResult> {
  return invokeCommand('prepare_claude_oauth_login');
}

export function completeClaudeOauthLogin(
  loginId: string,
  callbackOrCode: string,
  emailHint?: string | null,
): Promise<ClaudeAccountView> {
  return invokeCommand('complete_claude_oauth_login', { loginId, callbackOrCode, emailHint });
}
