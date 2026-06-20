import { expect, test, type Page } from '@playwright/test';

async function installSystemMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: async (command: string) => {
          if (command === 'list_codex_accounts') {
            return [];
          }
          if (command === 'get_current_codex_account') {
            return null;
          }
          if (command === 'get_system_snapshot') {
            return {
              appDataDir: '/Users/smoke/Library/Application Support/nuomi-switch',
              logsDir: '/Users/smoke/Library/Application Support/nuomi-switch/logs',
              accountsFilePath: '/Users/smoke/Library/Application Support/nuomi-switch/accounts.json',
              settingsFilePath: '/Users/smoke/Library/Application Support/nuomi-switch/settings.json',
              defaultCodexHome: '/Users/smoke/.codex',
              defaultCodexAuthFile: '/Users/smoke/.codex/auth.json',
              codexAuthFileExists: true,
            };
          }
          if (command === 'get_log_snapshot') {
            return {
              entries: [
                {
                  timestamp: '2026-06-11T00:00:00Z',
                  level: 'info',
                  message: 'Loaded auth file token=[REDACTED] api_key=[REDACTED]',
                },
              ],
            };
          }
          if (command === 'detect_codex_paths') {
            return {};
          }
          if (command === 'open_data_dir' || command === 'open_log_dir') {
            return null;
          }
          throw {
            code: 'SMOKE_UNKNOWN_COMMAND',
            message: `Unhandled smoke command: ${command}`,
            action: '请把该命令加入 Playwright smoke mock。',
            retryable: false,
          };
        },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
      },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
      }),
    )
    .toBe(true);
}

test.describe('Settings and logs smoke', () => {
  test('renders settings paths and actions', async ({ page }) => {
    await installSystemMock(page);

    await page.goto('/');
    await page.getByTitle('设置').click();

    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible();
    await expect(page.getByText('/Users/smoke/.codex/auth.json')).toBeVisible();
    await expect(page.getByText('已找到')).toBeVisible();
    await page.getByRole('button', { name: '检测 Codex 路径' }).click();
    await expectNoHorizontalOverflow(page);
  });

  test('renders redacted log snapshot', async ({ page }) => {
    await installSystemMock(page);

    await page.goto('/');
    await page.getByTitle('日志').click();

    await expect(page.getByRole('heading', { name: '日志', level: 1 })).toBeVisible();
    await expect(page.getByText('Loaded auth file token=[REDACTED] api_key=[REDACTED]')).toBeVisible();
    await expect(page.getByText('sk-smoke-redacted')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
