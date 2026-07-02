import type { AppError } from '../types/system';

type JsonRecord = Record<string, unknown>;

interface SessionCandidate {
  value: JsonRecord;
  sourceName: string;
  path: string;
}

interface ConvertedSession {
  authJson: JsonRecord;
  email?: string;
  name: string;
  expiresAt?: string;
  syntheticIdToken: boolean;
  hasRefreshToken: boolean;
}

export interface ChatGPTSessionImportDocument {
  jsonContent: string;
  count: number;
  syntheticIdTokenCount: number;
  missingRefreshTokenCount: number;
  accounts: Array<{
    email?: string;
    name: string;
    expiresAt?: string;
  }>;
}

const SESSION_IMPORT_URL = 'https://chatgpt.com/api/auth/session';

function sessionImportError(code: string, message: string, action: string): AppError {
  return {
    code,
    message,
    action,
    retryable: false,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readStringPath(value: unknown, path: string[]): string | undefined {
  return firstNonEmpty(readPath(value, path));
}

function readNumberPath(value: unknown, path: string[]): number | undefined {
  const item = readPath(value, path);
  return typeof item === 'number' && Number.isFinite(item) ? item : undefined;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeBase64UrlJson(value: JsonRecord): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function parseJwtPayload(token: string | undefined): JsonRecord | undefined {
  if (!token) {
    return undefined;
  }

  const segments = token.split('.');
  if (segments.length < 2) {
    return undefined;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as unknown;
    return isRecord(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function openAIAuthSection(payload: JsonRecord | undefined): JsonRecord {
  const section = payload?.['https://api.openai.com/auth'];
  return isRecord(section) ? section : {};
}

function openAIProfileSection(payload: JsonRecord | undefined): JsonRecord {
  const section = payload?.['https://api.openai.com/profile'];
  return isRecord(section) ? section : {};
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e11 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function timestampFromUnixSeconds(value: unknown): string | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return normalizeTimestamp(numeric);
}

function epochSecondsFromValue(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
}

function buildSyntheticCodexIdToken(
  email: string | undefined,
  accountId: string | undefined,
  planType: string | undefined,
  userId: string | undefined,
  expiresAt: string | undefined,
): string | undefined {
  if (!accountId) {
    return undefined;
  }

  const now = Math.trunc(Date.now() / 1000);
  const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;
  const authInfo: JsonRecord = {
    chatgpt_account_id: accountId,
    account_id: accountId,
  };

  if (planType) {
    authInfo.chatgpt_plan_type = planType;
  }

  if (userId) {
    authInfo.chatgpt_user_id = userId;
    authInfo.user_id = userId;
  }

  const payload: JsonRecord = {
    iat: now,
    exp: expires,
    'https://api.openai.com/auth': authInfo,
  };

  if (email) {
    payload.email = email;
  }

  return `${encodeBase64UrlJson({ alg: 'none', typ: 'JWT', nuomi_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
}

function collectSessionLikeObjects(value: unknown, sourceName = 'pasted-session'): SessionCandidate[] {
  const found: SessionCandidate[] = [];
  const visited = new WeakSet<object>();

  function visit(item: unknown, path: string) {
    if (!isRecord(item) && !Array.isArray(item)) {
      return;
    }

    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }

    if (visited.has(item)) {
      return;
    }
    visited.add(item);

    const token = firstNonEmpty(
      readStringPath(item, ['accessToken']),
      readStringPath(item, ['access_token']),
      readStringPath(item, ['tokens', 'accessToken']),
      readStringPath(item, ['tokens', 'access_token']),
      readStringPath(item, ['token', 'accessToken']),
      readStringPath(item, ['token', 'access_token']),
      readStringPath(item, ['credentials', 'accessToken']),
      readStringPath(item, ['credentials', 'access_token']),
    );
    const hasIdentity =
      isRecord(readPath(item, ['user'])) ||
      Boolean(
        firstNonEmpty(
          readStringPath(item, ['email']),
          readStringPath(item, ['name']),
          readStringPath(item, ['label']),
          readStringPath(item, ['account', 'id']),
          readStringPath(item, ['tokens', 'accountId']),
          readStringPath(item, ['tokens', 'account_id']),
          readStringPath(item, ['tokens', 'chatgptAccountId']),
          readStringPath(item, ['tokens', 'chatgpt_account_id']),
          readStringPath(item, ['providerSpecificData', 'chatgptAccountId']),
          readStringPath(item, ['providerSpecificData', 'chatgpt_account_id']),
          readStringPath(item, ['id']),
        ),
      );

    if (token && hasIdentity) {
      found.push({ value: item, sourceName, path });
      return;
    }

    for (const [key, child] of Object.entries(item)) {
      if (key === 'accessToken' || key === 'access_token' || key === 'sessionToken' || key === 'session_token') {
        continue;
      }
      visit(child, `${path}.${key}`);
    }
  }

  visit(value, '$');
  return found;
}

function parseSessionCandidates(text: string): SessionCandidate[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw sessionImportError(
      'IMPORT_SESSION_EMPTY',
      'Session JSON is empty.',
      `Open ${SESSION_IMPORT_URL}, copy the full JSON response, then paste it here.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw sessionImportError(
      'IMPORT_SESSION_INVALID_JSON',
      error instanceof Error ? error.message : 'Session JSON is invalid.',
      'Fix the JSON syntax before importing.',
    );
  }

  const candidates = collectSessionLikeObjects(parsed);
  if (candidates.length === 0) {
    throw sessionImportError(
      'IMPORT_SESSION_NOT_FOUND',
      'No ChatGPT session object with accessToken was found.',
      `Paste the full JSON response from ${SESSION_IMPORT_URL}.`,
    );
  }
  return candidates;
}

function convertSession(record: JsonRecord): ConvertedSession {
  const accessToken = firstNonEmpty(
    readStringPath(record, ['accessToken']),
    readStringPath(record, ['access_token']),
    readStringPath(record, ['tokens', 'accessToken']),
    readStringPath(record, ['tokens', 'access_token']),
    readStringPath(record, ['token', 'accessToken']),
    readStringPath(record, ['token', 'access_token']),
    readStringPath(record, ['credentials', 'accessToken']),
    readStringPath(record, ['credentials', 'access_token']),
  );
  if (!accessToken) {
    throw sessionImportError('IMPORT_SESSION_ACCESS_TOKEN_MISSING', 'Session JSON is missing accessToken.', 'Paste the full session JSON.');
  }

  const refreshToken = firstNonEmpty(
    readStringPath(record, ['refreshToken']),
    readStringPath(record, ['refresh_token']),
    readStringPath(record, ['tokens', 'refreshToken']),
    readStringPath(record, ['tokens', 'refresh_token']),
    readStringPath(record, ['token', 'refreshToken']),
    readStringPath(record, ['token', 'refresh_token']),
    readStringPath(record, ['credentials', 'refresh_token']),
  );
  const inputIdToken = firstNonEmpty(
    readStringPath(record, ['idToken']),
    readStringPath(record, ['id_token']),
    readStringPath(record, ['tokens', 'idToken']),
    readStringPath(record, ['tokens', 'id_token']),
    readStringPath(record, ['token', 'idToken']),
    readStringPath(record, ['token', 'id_token']),
    readStringPath(record, ['credentials', 'id_token']),
  );

  const accessPayload = parseJwtPayload(accessToken);
  const idPayload = parseJwtPayload(inputIdToken);
  const accessAuth = openAIAuthSection(accessPayload);
  const idAuth = openAIAuthSection(idPayload);
  const profile = openAIProfileSection(accessPayload);
  const expiresAt = firstNonEmpty(
    timestampFromUnixSeconds(readNumberPath(accessPayload, ['exp'])),
    normalizeTimestamp(readPath(record, ['expires'])),
    normalizeTimestamp(readPath(record, ['expiresAt'])),
    normalizeTimestamp(readPath(record, ['expired'])),
    normalizeTimestamp(readPath(record, ['expires_at'])),
  );
  const email = firstNonEmpty(
    readStringPath(record, ['user', 'email']),
    readStringPath(record, ['email']),
    readStringPath(record, ['meta', 'label']),
    readStringPath(record, ['label']),
    readStringPath(record, ['credentials', 'email']),
    readStringPath(record, ['providerSpecificData', 'email']),
    readStringPath(profile, ['email']),
    readStringPath(idPayload, ['email']),
    readStringPath(accessPayload, ['email']),
  );
  const accountId = firstNonEmpty(
    readStringPath(record, ['account', 'id']),
    readStringPath(record, ['account_id']),
    readStringPath(record, ['accountId']),
    readStringPath(record, ['tokens', 'accountId']),
    readStringPath(record, ['tokens', 'account_id']),
    readStringPath(record, ['chatgptAccountId']),
    readStringPath(record, ['chatgpt_account_id']),
    readStringPath(record, ['meta', 'chatgptAccountId']),
    readStringPath(record, ['meta', 'chatgpt_account_id']),
    readStringPath(record, ['tokens', 'chatgptAccountId']),
    readStringPath(record, ['tokens', 'chatgpt_account_id']),
    readStringPath(record, ['providerSpecificData', 'chatgptAccountId']),
    readStringPath(record, ['providerSpecificData', 'chatgpt_account_id']),
    readStringPath(record, ['credentials', 'chatgpt_account_id']),
    readStringPath(accessAuth, ['chatgpt_account_id']),
    readStringPath(idAuth, ['chatgpt_account_id']),
    readStringPath(accessAuth, ['account_id']),
    readStringPath(idAuth, ['account_id']),
  );
  const userId = firstNonEmpty(
    readStringPath(record, ['user', 'id']),
    readStringPath(record, ['user_id']),
    readStringPath(record, ['chatgptUserId']),
    readStringPath(record, ['chatgpt_user_id']),
    readStringPath(record, ['providerSpecificData', 'chatgptUserId']),
    readStringPath(record, ['providerSpecificData', 'chatgpt_user_id']),
    readStringPath(accessAuth, ['chatgpt_user_id']),
    readStringPath(accessAuth, ['user_id']),
    readStringPath(idAuth, ['chatgpt_user_id']),
    readStringPath(idAuth, ['user_id']),
    readStringPath(idPayload, ['sub']),
    readStringPath(accessPayload, ['sub']),
  );
  const planType = firstNonEmpty(
    readStringPath(record, ['account', 'planType']),
    readStringPath(record, ['account', 'plan_type']),
    readStringPath(record, ['planType']),
    readStringPath(record, ['plan_type']),
    readStringPath(record, ['providerSpecificData', 'chatgptPlanType']),
    readStringPath(record, ['providerSpecificData', 'chatgpt_plan_type']),
    readStringPath(record, ['credentials', 'plan_type']),
    readStringPath(accessAuth, ['chatgpt_plan_type']),
    readStringPath(idAuth, ['chatgpt_plan_type']),
  );
  const subscriptionActiveUntil = firstNonEmpty(
    readStringPath(record, ['account', 'subscriptionActiveUntil']),
    readStringPath(record, ['account', 'subscription_active_until']),
    readStringPath(record, ['subscriptionActiveUntil']),
    readStringPath(record, ['subscription_active_until']),
    readStringPath(accessAuth, ['chatgpt_subscription_active_until']),
    readStringPath(idAuth, ['chatgpt_subscription_active_until']),
  );
  const syntheticIdToken = inputIdToken ? undefined : buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt);
  const idToken = inputIdToken ?? syntheticIdToken;

  if (!idToken) {
    throw sessionImportError(
      'IMPORT_SESSION_ID_TOKEN_MISSING',
      'Session JSON cannot be converted because account id or idToken is missing.',
      'Use the full ChatGPT session JSON, or paste a JSON export that includes idToken/account.id.',
    );
  }

  const name = firstNonEmpty(email, readStringPath(record, ['name']), 'ChatGPT Session') ?? 'ChatGPT Session';
  const authJson: JsonRecord = {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken ?? '',
      account_id: accountId,
    },
    last_refresh: new Date().toISOString(),
  };

  if (email) {
    authJson.email = email;
  }
  if (planType) {
    authJson.plan_type = planType;
  }
  if (subscriptionActiveUntil) {
    authJson.subscription_active_until = subscriptionActiveUntil;
  }
  if (syntheticIdToken) {
    authJson.id_token_synthetic = true;
  }

  return {
    authJson,
    email,
    name,
    expiresAt,
    syntheticIdToken: Boolean(syntheticIdToken),
    hasRefreshToken: Boolean(refreshToken),
  };
}

export function convertChatGPTSessionTextToCodexJson(text: string): ChatGPTSessionImportDocument {
  const candidates = parseSessionCandidates(text);
  const converted = candidates.map((candidate) => convertSession(candidate.value));
  const document = converted.length === 1 ? converted[0].authJson : converted.map((item) => item.authJson);

  return {
    jsonContent: JSON.stringify(document, null, 2),
    count: converted.length,
    syntheticIdTokenCount: converted.filter((item) => item.syntheticIdToken).length,
    missingRefreshTokenCount: converted.filter((item) => !item.hasRefreshToken).length,
    accounts: converted.map((item) => ({
      email: item.email,
      name: item.name,
      expiresAt: item.expiresAt,
    })),
  };
}

function containsCodexAuthShape(value: unknown): boolean {
  const visited = new WeakSet<object>();

  function visit(item: unknown): boolean {
    if (!isRecord(item) && !Array.isArray(item)) {
      return false;
    }

    if (Array.isArray(item)) {
      return item.some((child) => visit(child));
    }

    if (visited.has(item)) {
      return false;
    }
    visited.add(item);

    if (
      typeof item.auth_mode === 'string' ||
      typeof item.OPENAI_API_KEY === 'string' ||
      typeof item.id_token === 'string' ||
      typeof item.idToken === 'string' ||
      typeof readPath(item, ['tokens', 'id_token']) === 'string' ||
      typeof readPath(item, ['tokens', 'idToken']) === 'string'
    ) {
      return true;
    }

    return Object.entries(item).some(([key, child]) => {
      if (key === 'accessToken' || key === 'access_token' || key === 'sessionToken' || key === 'session_token') {
        return false;
      }
      return visit(child);
    });
  }

  return visit(value);
}

export function isLikelyChatGPTSessionText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (containsCodexAuthShape(parsed)) {
      return false;
    }
    return collectSessionLikeObjects(parsed).length > 0;
  } catch {
    return false;
  }
}

export function previewChatGPTSessionText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '还没有粘贴 Session JSON。';
  }

  try {
    const converted = convertChatGPTSessionTextToCodexJson(trimmed);
    const refreshHint =
      converted.missingRefreshTokenCount > 0
        ? `其中 ${converted.missingRefreshTokenCount} 个没有 refresh_token。`
        : '包含 refresh_token。';
    return `${converted.count} 个 Session 可导入。${refreshHint}`;
  } catch (error) {
    if (isRecord(error) && typeof error.message === 'string') {
      return error.message;
    }
    return '导入前会检查 Session JSON。';
  }
}
