import { useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { ConfirmResetSettingsModal } from '../components/account/ConfirmResetSettingsModal';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useCodexAccountsStore } from '../stores/useCodexAccountsStore';
import './CodexAccountsPage.css';

const resetDescription =
  '重置codex的默认设置，仅适用于使用过中转站，然后在codex中退出选择账号登录后，无法使用的情况下重置设置';

export function CodexResetSettingsPage() {
  const error = useCodexAccountsStore((state) => state.error);
  const resettingProviderConfig = useCodexAccountsStore((state) => state.resettingProviderConfig);
  const resetSettingsNotice = useCodexAccountsStore((state) => state.resetSettingsNotice);
  const resetProviderConfig = useCodexAccountsStore((state) => state.resetProviderConfig);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  async function confirmResetSettings() {
    try {
      await resetProviderConfig();
      setConfirmResetOpen(false);
    } catch {
      // The store exposes the normalized error through ErrorBanner.
    }
  }

  return (
    <>
      {error ? <ErrorBanner error={error} /> : null}
      {resetSettingsNotice ? <div className="account-switch-notice">{resetSettingsNotice}</div> : null}

      <section className="account-reset-panel" aria-labelledby="account-reset-title">
        <div className="account-reset-copy">
          <div className="account-reset-icon" aria-hidden="true">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h2 id="account-reset-title">重置设置</h2>
            <p>{resetDescription}</p>
          </div>
        </div>
        <Button
          variant="danger"
          icon={<RotateCcw size={16} />}
          loading={resettingProviderConfig}
          onClick={() => setConfirmResetOpen(true)}
        >
          重置设置
        </Button>
      </section>

      <ConfirmResetSettingsModal
        open={confirmResetOpen}
        resetting={resettingProviderConfig}
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => void confirmResetSettings()}
      />
    </>
  );
}
