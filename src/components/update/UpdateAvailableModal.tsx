import { openUrl } from '@tauri-apps/plugin-opener';
import { Download, Sparkles } from 'lucide-react';
import { useUpdateStore } from '../../stores/useUpdateStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal/Modal';
import './UpdateAvailableModal.css';

export function UpdateAvailableModal() {
  const { appVersion, updateInfo, updateStatus, updateModalDismissed, dismissUpdateModal } = useUpdateStore();
  const open = updateStatus === 'available' && Boolean(updateInfo) && !updateModalDismissed;

  return (
    <Modal
      open={open}
      onClose={dismissUpdateModal}
      title="发现新版本"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={dismissUpdateModal}>
            稍后再说
          </Button>
          <Button
            variant="primary"
            icon={<Download size={16} />}
            onClick={() => {
              if (updateInfo?.releaseUrl) {
                void openUrl(updateInfo.releaseUrl);
              }
              dismissUpdateModal();
            }}
          >
            获取更新
          </Button>
        </>
      }
    >
      <div className="update-modal-content">
        <div className="update-modal-icon" aria-hidden="true">
          <Sparkles size={22} />
        </div>
        <div>
          <p className="update-modal-version">
            v{appVersion} <span>→</span> v{updateInfo?.version}
          </p>
          {updateInfo?.notes ? <p className="update-modal-notes">{updateInfo.notes}</p> : null}
        </div>
      </div>
    </Modal>
  );
}
