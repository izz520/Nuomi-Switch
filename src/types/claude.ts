import type { AppError } from './system';

export type ClaudePlatform = 'desktop' | 'cli';
export type ClaudeAuthMode = 'desktop_oauth' | 'desktop_gateway' | 'cli_oauth' | 'api_key';

export interface ClaudeAccountView {
  id: string;
  displayName: string;
  email?: string | null;
  authMode: ClaudeAuthMode;
  accountId?: string | null;
  organizationName?: string | null;
  planType?: string | null;
  apiKey?: string | null;
  apiBaseUrl?: string | null;
  desktopProfileDir?: string | null;
  desktopGatewayAuthScheme?: string | null;
  desktopGatewayModels?: string[] | null;
  desktopGatewayConnectionMode?: ClaudeDesktopGatewayConnectionMode | null;
  desktopGatewayUpstreamModels?: string[] | null;
  desktopGatewayModelMappings?: ClaudeDesktopGatewayModelMapping[] | null;
  tags: string[];
  note?: string | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number | null;
  isCurrent: boolean;
}

export interface ClaudeCurrentAccounts {
  claudeDesktopAccount?: string | null;
  claudeCodeAccount?: string | null;
}

export interface ClaudeSwitchResult {
  account: ClaudeAccountView;
  warnings: string[];
  currentAccounts: ClaudeCurrentAccounts;
}

export type ClaudeDesktopGatewayConnectionMode = 'direct' | 'local_mapping';

export interface ClaudeDesktopGatewayModel {
  id: string;
  displayName?: string | null;
}

export interface ClaudeDesktopGatewayModelMapping {
  desktopModel: string;
  upstreamModel: string;
  labelOverride?: string | null;
  supports1m?: boolean | null;
}

export interface ClaudeDesktopGatewayModelsResult {
  models: ClaudeDesktopGatewayModel[];
  latencyMs: number;
  recommendedMode?: ClaudeDesktopGatewayConnectionMode | string | null;
  hasClaudeModels: boolean;
  authScheme?: 'bearer' | 'x-api-key' | null;
}

export interface ClaudeDesktopGatewayInput {
  displayName: string;
  apiKey: string;
  apiBaseUrl: string;
  authScheme: string;
  connectionMode: ClaudeDesktopGatewayConnectionMode;
  desktopGatewayModels: string[];
  desktopGatewayUpstreamModels?: string[] | null;
  desktopGatewayModelMappings?: ClaudeDesktopGatewayModelMapping[] | null;
}

export interface ClaudeDesktopJsonImportInput {
  jsonContent: string;
}

export interface ClaudeApiKeyInput {
  displayName: string;
  apiKey: string;
  apiBaseUrl: string;
  authScheme: string;
  connectionMode: ClaudeDesktopGatewayConnectionMode;
  desktopGatewayModels: string[];
  desktopGatewayUpstreamModels?: string[] | null;
  desktopGatewayModelMappings?: ClaudeDesktopGatewayModelMapping[] | null;
}

export interface ClaudeOauthPrepareResult {
  loginId: string;
  authorizeUrl: string;
}

export function isClaudeDesktopMode(authMode: ClaudeAuthMode): boolean {
  return authMode === 'desktop_oauth' || authMode === 'desktop_gateway';
}

export function isClaudeCliMode(authMode: ClaudeAuthMode): boolean {
  return authMode === 'cli_oauth' || authMode === 'api_key';
}

export function matchesClaudePlatform(account: ClaudeAccountView, platform: ClaudePlatform): boolean {
  return platform === 'desktop' ? isClaudeDesktopMode(account.authMode) : isClaudeCliMode(account.authMode);
}

export interface ClaudeAccountsErrorState {
  error: AppError | null;
}
