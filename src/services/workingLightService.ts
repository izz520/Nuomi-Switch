import { invokeCommand } from './tauriInvoke';
import type {
  WorkingLightAgent,
  WorkingLightAgentState,
  WorkingLightHookStatus,
  WorkingLightPreferences,
  WorkingLightSnapshot,
  WorkingLightStateFile,
} from '../types/workingLight';

export function getWorkingLightSnapshot(): Promise<WorkingLightSnapshot> {
  return invokeCommand('working_light_get_snapshot');
}

export function setWorkingLightAgentState(
  agent: WorkingLightAgent,
  state: WorkingLightAgentState,
  message?: string,
): Promise<WorkingLightStateFile> {
  return invokeCommand('working_light_set_agent_state', { agent, state, message });
}

export function setWorkingLightMuted(muted: boolean): Promise<WorkingLightPreferences> {
  return invokeCommand('working_light_set_muted', { muted });
}

export function setWorkingLightWindowEnabled(enabled: boolean): Promise<WorkingLightPreferences> {
  return invokeCommand('working_light_set_window_enabled', { enabled });
}

export function setWorkingLightAgentEnabled(
  agent: WorkingLightAgent,
  enabled: boolean,
): Promise<WorkingLightPreferences> {
  return invokeCommand('working_light_set_agent_enabled', { agent, enabled });
}

export function getWorkingLightHookStatus(): Promise<WorkingLightHookStatus> {
  return invokeCommand('working_light_get_hook_status');
}

export function installWorkingLightHooks(agent: WorkingLightAgent): Promise<WorkingLightHookStatus> {
  return invokeCommand('working_light_install_hooks', { agent });
}

export function showWorkingLightWindow(): Promise<void> {
  return invokeCommand('working_light_show_window');
}

export function hideWorkingLightWindow(): Promise<void> {
  return invokeCommand('working_light_hide_window');
}

export function closeWorkingLightWindow(): Promise<void> {
  return invokeCommand('working_light_close_window');
}

export function resizeWorkingLightWindow(visibleAgentCount: number): Promise<void> {
  return invokeCommand('working_light_resize_window', { visibleAgentCount });
}

export function activateWorkingLightAgent(agent: WorkingLightAgent): Promise<void> {
  return invokeCommand('working_light_activate_agent', { agent });
}
