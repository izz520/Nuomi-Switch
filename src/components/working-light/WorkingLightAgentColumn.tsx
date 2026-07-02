import { WorkingLightTrafficLight } from './WorkingLightTrafficLight';
import {
  WORKING_LIGHT_STATE_LABELS,
  type WorkingLightAgentStatus,
  type WorkingLightPreferences,
} from '../../types/workingLight';

interface WorkingLightAgentColumnProps {
  label: string;
  status: WorkingLightAgentStatus;
  preferences: WorkingLightPreferences;
}

export function WorkingLightAgentColumn({
  label,
  status,
  preferences,
}: WorkingLightAgentColumnProps) {
  return (
    <article
      className={`working-light-agent ${status.state}`}
      aria-label={`${label} ${WORKING_LIGHT_STATE_LABELS[status.state]}`}
      title={`${label} · ${WORKING_LIGHT_STATE_LABELS[status.state]}`}
    >
      <WorkingLightTrafficLight status={status} waitingBlinkSeconds={preferences.waitingBlinkSeconds} />
      <span className="working-light-copy">
        <span className="working-light-agent-name">{label}</span>
        <span className={`working-light-state-label ${status.state}`} aria-live="polite">
          {WORKING_LIGHT_STATE_LABELS[status.state]}
        </span>
      </span>
    </article>
  );
}
