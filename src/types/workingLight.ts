export type WorkingLightAgent = 'codex' | 'claude';

export type WorkingLightAgentState = 'idle' | 'working' | 'done' | 'waiting' | 'error';

export interface WorkingLightAgentStatus {
  state: WorkingLightAgentState;
  updatedAt: number;
  message?: string;
}

export interface WorkingLightStateFile {
  version: 1;
  agents: Record<WorkingLightAgent, WorkingLightAgentStatus>;
}

export interface WorkingLightPreferences {
  muted: boolean;
  doneAutoIdleSeconds: number;
  waitingBlinkSeconds: number;
  codexEnabled: boolean;
  claudeEnabled: boolean;
}

export interface WorkingLightDetection {
  agent: WorkingLightAgent;
  label: string;
  detected: boolean;
  source: 'process' | 'none';
  pid?: number;
  processName?: string;
}

export interface WorkingLightHookInstallation {
  installed: boolean;
  path: string;
}

export interface WorkingLightHookStatus {
  codex: WorkingLightHookInstallation;
  claude: WorkingLightHookInstallation;
  executablePath: string;
}

export interface WorkingLightSnapshot {
  state: WorkingLightStateFile;
  preferences: WorkingLightPreferences;
  detections: WorkingLightDetection[];
}

export const WORKING_LIGHT_STATE_LABELS: Record<WorkingLightAgentState, string> = {
  idle: '空闲',
  working: '工作中',
  done: '待验收',
  waiting: '等你回复',
  error: '异常',
};

export const DEFAULT_WORKING_LIGHT_STATE: WorkingLightStateFile = {
  version: 1,
  agents: {
    codex: { state: 'idle', updatedAt: 0 },
    claude: { state: 'idle', updatedAt: 0 },
  },
};

export const DEFAULT_WORKING_LIGHT_PREFERENCES: WorkingLightPreferences = {
  muted: false,
  doneAutoIdleSeconds: 600,
  waitingBlinkSeconds: 10,
  codexEnabled: true,
  claudeEnabled: true,
};

export function nextWorkingLightState(state: WorkingLightAgentState): WorkingLightAgentState {
  const order: WorkingLightAgentState[] = ['idle', 'working', 'done', 'waiting', 'error'];
  return order[(order.indexOf(state) + 1) % order.length];
}
