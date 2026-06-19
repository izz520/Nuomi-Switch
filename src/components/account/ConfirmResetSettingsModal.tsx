import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal/Modal';
import './ConfirmResetSettingsModal.css';

interface ConfirmResetSettingsModalProps {
  open: boolean;
  resetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmResetSettingsModal({
  open,
  resetting,
  onCancel,
  onConfirm,
}: ConfirmResetSettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={resetting ? () => undefined : onCancel}
      title="确认重置设置？"
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={resetting} onClick={onCancel}>
            取消
          </Button>
          <Button variant="danger" icon={<RotateCcw size={16} />} loading={resetting} onClick={onConfirm}>
            确认重置
          </Button>
        </>
      }
    >
      <div className="reset-confirm-content">
        <div className="reset-confirm-icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </div>
        <div className="reset-confirm-copy">
          <p>确定要清除 config.toml 里面的 provider 设置吗？</p>
          <p>该操作不会删除已保存账号，但会恢复 Codex 默认 provider 配置。</p>
        </div>
      </div>
    </Modal>
  );
}
