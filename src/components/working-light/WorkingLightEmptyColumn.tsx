import { WorkingLightTrafficLight } from './WorkingLightTrafficLight';
import type { WorkingLightPreferences } from '../../types/workingLight';

interface WorkingLightEmptyColumnProps {
  preferences: WorkingLightPreferences;
}

export function WorkingLightEmptyColumn({ preferences }: WorkingLightEmptyColumnProps) {
  return (
    <div className="working-light-agent idle empty" role="status" aria-label="未连接">
      <WorkingLightTrafficLight status={{ state: 'idle', updatedAt: 0 }} waitingBlinkSeconds={preferences.waitingBlinkSeconds} />
      <span className="working-light-copy">
        <span className="working-light-agent-name">未连接</span>
        <span className="working-light-state-label idle">空闲</span>
      </span>
    </div>
  );
}
