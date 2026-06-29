import { getVersion } from '@tauri-apps/api/app';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'unconfigured' | 'error';

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  notes?: string;
  publishedAt?: string;
}

interface UpdateManifest {
  version?: unknown;
  releaseUrl?: unknown;
  notes?: unknown;
  publishedAt?: unknown;
}

const manifestUrl = import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined;

export function getUpdateManifestUrl(): string | null {
  return manifestUrl?.trim() || null;
}

export function getAppVersion(): Promise<string> {
  return getVersion();
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  const url = getUpdateManifestUrl();
  if (!url) {
    return null;
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`更新清单请求失败：HTTP ${response.status}`);
  }

  const manifest = (await response.json()) as UpdateManifest;
  if (typeof manifest.version !== 'string' || typeof manifest.releaseUrl !== 'string') {
    throw new Error('更新清单格式无效。');
  }

  if (compareVersions(manifest.version, currentVersion) <= 0) {
    return null;
  }

  return {
    version: manifest.version,
    releaseUrl: manifest.releaseUrl,
    notes: typeof manifest.notes === 'string' ? manifest.notes : undefined,
    publishedAt: typeof manifest.publishedAt === 'string' ? manifest.publishedAt : undefined,
  };
}

export function compareVersions(nextVersion: string, currentVersion: string): number {
  const next = normalizeVersion(nextVersion);
  const current = normalizeVersion(currentVersion);
  const length = Math.max(next.length, current.length);

  for (let index = 0; index < length; index += 1) {
    const left = next[index] ?? 0;
    const right = current[index] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
