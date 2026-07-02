import type { WorkingLightAgentState, WorkingLightAgentStatus } from '../../types/workingLight';

interface WorkingLightTrafficLightProps {
  status: WorkingLightAgentStatus;
  waitingBlinkSeconds: number;
}

const LIGHTS: Array<{ color: 'red' | 'blue' | 'green'; activeFor: WorkingLightAgentState[] }> = [
  { color: 'red', activeFor: ['waiting', 'error'] },
  { color: 'blue', activeFor: ['working'] },
  { color: 'green', activeFor: ['done'] },
];

function getActiveColor(state: WorkingLightAgentState): 'red' | 'blue' | 'green' | 'idle' {
  return LIGHTS.find((light) => light.activeFor.includes(state))?.color ?? 'idle';
}

export function WorkingLightTrafficLight({ status, waitingBlinkSeconds }: WorkingLightTrafficLightProps) {
  const shouldBlink =
    status.state === 'waiting' && status.updatedAt > 0 && Date.now() - status.updatedAt < waitingBlinkSeconds * 1000;
  const activeColor = getActiveColor(status.state);

  return (
    <span className="working-light-traffic" aria-hidden="true">
      <span className={`working-light-bulb ${activeColor} ${shouldBlink ? 'blink' : ''}`} />
    </span>
  );
}
