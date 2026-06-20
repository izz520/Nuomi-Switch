import { expect, test, type Page } from '@playwright/test';

interface TauriMockOptions {
  accounts?: unknown[];
  currentAccount?: unknown | null;
}

const oauthAccount = {
  id: 'oauth-long-email',
  displayName: 'Work Codex OAuth',
  email: 'very.long.codex.user.name.for.layout.validation@example-enterprise-domain.test',
  authMode: 'oauth',
  accountId: 'acct_team_nuomi_switch_smoke_long_identifier_001',
  userId: 'user_smoke_001',
  planType: 'pro',
  apiBaseUrl: null,
  quota: {
    hourlyRemainingPercent: 82,
    hourlyResetAt: 1_800_000_000,
    weeklyRemainingPercent: 64,
    weeklyResetAt: 1_800_086_400,
    resetCredits: {
      total: 2,
      credits: [
        { expiresAt: 1_800_000_000 },
        { expiresAt: 1_800_086_400 },
      ],
      updatedAt: 1_799_990_000,
    },
    updatedAt: 1_799_990_000,
    stale: false,
  },
  quotaError: null,
  tags: ['smoke'],
  note: null,
  createdAt: 1_799_900_000,
  updatedAt: 1_799_990_000,
  lastUsedAt: 1_799_991_000,
  isCurrent: true,
  capabilityWarning: null,
};

const apiKeyAccount = {
  id: 'api-key-smoke',
  displayName: 'API Key Only',
  email: null,
  authMode: 'api_key',
  accountId: null,
  userId: null,
  planType: null,
  apiBaseUrl: 'https://api.openai.com/v1',
  quota: null,
  quotaError: null,
  tags: ['api'],
  note: null,
  createdAt: 1_799_900_100,
  updatedAt: 1_799_900_100,
  lastUsedAt: null,
  isCurrent: false,
  capabilityWarning: 'API key accounts cannot refresh ChatGPT quota.',
};

async function installTauriMock(page: Page, options: TauriMockOptions): Promise<void> {
  await page.addInitScript((mockOptions) => {
    const accounts = mockOptions.accounts ?? [];
    const currentAccount = mockOptions.currentAccount ?? null;

    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: async (command: string) => {
          if (command === 'list_codex_accounts') {
            return accounts;
          }
          if (command === 'get_current_codex_account') {
            return currentAccount;
          }
          if (command === 'refresh_all_codex_quotas') {
            return accounts;
          }
          if (command === 'delete_codex_account') {
            return null;
          }
          if (command === 'reset_codex_provider_config') {
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
  }, options);
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

test.describe('Accounts page smoke', () => {
  test('renders empty state and opens import drawer', async ({ page }) => {
    await installTauriMock(page, { accounts: [], currentAccount: null });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: '还没有 Codex 账号' })).toBeVisible();
    await expect(page.getByText('添加当前本地 Codex 授权')).toBeVisible();
    await page.getByRole('button', { name: '添加账号' }).first().click();
    await expect(page.getByRole('dialog', { name: '添加账号' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('renders account list with accordion details and quota states', async ({ page }) => {
    await installTauriMock(page, {
      accounts: [oauthAccount, apiKeyAccount],
      currentAccount: oauthAccount,
    });

    await page.goto('/');

    await expect(page.getByLabel('账号统计')).toContainText('总账号');
    const oauthRow = page.locator('.account-row').filter({ hasText: oauthAccount.email });
    const apiKeyRow = page.locator('.account-row').filter({ hasText: 'API Key Only' });

    await expect(oauthRow).toBeVisible();
    await expect(apiKeyRow).toBeVisible();
    await expect(oauthRow.getByRole('button', { name: '当前账号' })).toBeVisible();

    // The current account starts expanded, so its detail quota is visible.
    await expect(oauthRow.getByText('5h')).toBeVisible();
    await expect(oauthRow.getByText('每周')).toBeVisible();
    await expect(oauthRow.getByText('重置机会')).toBeVisible();
    await expect(oauthRow.getByText('2 次')).toBeVisible();
    await expect(oauthRow.getByText('acct_team_nuomi_switch_smoke_long_identifier_001')).toBeVisible();

    await apiKeyRow.locator('.account-summary').click();
    await expect(apiKeyRow.getByText('API Key', { exact: true })).toBeVisible();
    await expect(apiKeyRow.getByRole('button', { name: '切换账号' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('filters accounts by the search box', async ({ page }) => {
    await installTauriMock(page, {
      accounts: [oauthAccount, apiKeyAccount],
      currentAccount: oauthAccount,
    });

    await page.goto('/');

    const oauthRow = page.locator('.account-row').filter({ hasText: oauthAccount.email });
    const apiKeyRow = page.locator('.account-row').filter({ hasText: 'API Key Only' });
    await expect(oauthRow).toBeVisible();
    await expect(apiKeyRow).toBeVisible();

    await page.getByLabel('搜索账号').fill('API Key Only');
    await expect(apiKeyRow).toBeVisible();
    await expect(oauthRow).toHaveCount(0);

    await page.getByLabel('搜索账号').fill('no-such-account');
    await expect(page.getByText('没有匹配')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('removes an account through the confirm dialog', async ({ page }) => {
    await installTauriMock(page, {
      accounts: [oauthAccount, apiKeyAccount],
      currentAccount: oauthAccount,
    });

    await page.goto('/');

    const apiKeyRow = page.locator('.account-row').filter({ hasText: 'API Key Only' });
    await apiKeyRow.locator('.account-summary').click();
    await apiKeyRow.getByRole('button', { name: '删除账号' }).click();

    const dialog = page.getByRole('dialog', { name: '删除这个账号？' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '删除账号' }).click();

    await expect(page.locator('.account-row').filter({ hasText: 'API Key Only' })).toHaveCount(0);
    await expect(page.locator('.account-row').filter({ hasText: oauthAccount.email })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('resets provider settings after a confirmation dialog', async ({ page }) => {
    await installTauriMock(page, {
      accounts: [oauthAccount, apiKeyAccount],
      currentAccount: oauthAccount,
    });

    await page.goto('/');
    await page.getByRole('tab', { name: '重置设置' }).click();

    await expect(page.getByText('重置codex的默认设置')).toBeVisible();
    await page.getByRole('button', { name: '重置设置' }).click();

    const dialog = page.getByRole('dialog', { name: '确认重置设置？' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '确认重置' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Codex 默认设置已重置')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('supports keyboard tab navigation to primary actions', async ({ page }) => {
    await installTauriMock(page, {
      accounts: [oauthAccount, apiKeyAccount],
      currentAccount: oauthAccount,
    });

    await page.goto('/');
    await page.keyboard.press('Tab');

    const activeLabels = [];
    for (let index = 0; index < 16; index += 1) {
      activeLabels.push(
        await page.evaluate(() => {
          const active = document.activeElement;
          return active instanceof HTMLElement ? active.innerText || active.getAttribute('aria-label') || active.title : '';
        }),
      );
      await page.keyboard.press('Tab');
    }

    expect(activeLabels.some((label) => label.includes('添加账号'))).toBe(true);
    expect(activeLabels.some((label) => label.includes('刷新额度') || label.includes('切换账号'))).toBe(true);
    expect(activeLabels.some((label) => label.includes('设置'))).toBe(true);
    await expectNoHorizontalOverflow(page);
  });
});
