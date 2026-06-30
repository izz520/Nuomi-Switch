import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'unconfigured'
  | 'downloading'
  | 'installing'
  | 'installed'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  publishedAt?: string;
}

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  finished: boolean;
}

let pendingUpdate: Update | null = null;

export function canUseNativeUpdater(): boolean {
  if (!import.meta.env.DEV) {
    return true;
  }

  return new URLSearchParams(window.location.search).get('useNativeUpdater') === '1';
}

export function getAppVersion(): Promise<string> {
  return getVersion();
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!canUseNativeUpdater()) {
    return null;
  }

  if (pendingUpdate) {
    await pendingUpdate.close().catch(() => undefined);
    pendingUpdate = null;
  }

  const update = await check();
  if (!update) {
    return null;
  }

  pendingUpdate = update;
  return normalizeUpdateInfo(update);
}

export async function downloadAndInstallUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void> {
  let update = pendingUpdate;
  if (!update) {
    update = await check();
    if (!update) {
      throw new Error('当前没有可安装的更新。');
    }
    pendingUpdate = update;
  }

  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event) => {
    const progress = reduceDownloadEvent(event, downloadedBytes, totalBytes);
    downloadedBytes = progress.downloadedBytes;
    totalBytes = progress.totalBytes;
    onProgress(progress);
  });

  await update.close().catch(() => undefined);
  if (pendingUpdate === update) {
    pendingUpdate = null;
  }
}

export function relaunchApp(): Promise<void> {
  return relaunch();
}

function normalizeUpdateInfo(update: Update): UpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body,
    publishedAt: update.date,
  };
}

function reduceDownloadEvent(
  event: DownloadEvent,
  downloadedBytes: number,
  totalBytes: number | null,
): UpdateProgress {
  if (event.event === 'Started') {
    const nextTotalBytes = event.data.contentLength ?? null;
    return progressState(0, nextTotalBytes, false);
  }

  if (event.event === 'Progress') {
    return progressState(downloadedBytes + event.data.chunkLength, totalBytes, false);
  }

  return progressState(totalBytes ?? downloadedBytes, totalBytes, true);
}

function progressState(downloadedBytes: number, totalBytes: number | null, finished: boolean): UpdateProgress {
  const percent =
    totalBytes && totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null;

  return {
    downloadedBytes,
    totalBytes,
    percent: finished && percent === null ? 100 : percent,
    finished,
  };
}
