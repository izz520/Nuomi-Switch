import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Volume2, VolumeX, X } from 'lucide-react';
import { startWindowDragging } from '../../services/windowService';
import {
  closeWorkingLightWindow,
  getWorkingLightSnapshot,
  hideWorkingLightWindow,
  resizeWorkingLightWindow,
  setWorkingLightMuted,
} from '../../services/workingLightService';
import {
  DEFAULT_WORKING_LIGHT_PREFERENCES,
  DEFAULT_WORKING_LIGHT_STATE,
  type WorkingLightAgent,
  type WorkingLightAgentState,
  type WorkingLightDetection,
  type WorkingLightPreferences,
  type WorkingLightStateFile,
} from '../../types/workingLight';
import { WorkingLightAgentColumn } from './WorkingLightAgentColumn';
import { WorkingLightEmptyColumn } from './WorkingLightEmptyColumn';

type AudioContextClass = typeof AudioContext;

function createAudioContext(): AudioContext | null {
  const AudioCtor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
  return AudioCtor ? new AudioCtor() : null;
}

function playTone(
  context: AudioContext,
  start: number,
  duration: number,
  fromFrequency: number,
  toFrequency: number,
  peakGain: number,
  type: OscillatorType = 'sine',
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + Math.min(0.035, duration * 0.28));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playStateSound(state: WorkingLightAgentState): void {
  const context = createAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  if (state === 'waiting' || state === 'error') {
    playTone(context, now, 0.12, 360, 180, 0.08, 'square');
    playTone(context, now + 0.16, 0.1, 410, 210, 0.06, 'square');
    return;
  }

  if (state === 'done') {
    playTone(context, now, 0.18, 620, 880, 0.045, 'sine');
    playTone(context, now + 0.14, 0.18, 880, 520, 0.036, 'triangle');
    return;
  }

  if (state === 'working') {
    playTone(context, now, 0.15, 220, 340, 0.04, 'sine');
    playTone(context, now + 0.12, 0.18, 340, 260, 0.035, 'triangle');
  }
}

function isAgentEnabled(agent: WorkingLightAgent, preferences: WorkingLightPreferences): boolean {
  return agent === 'codex' ? preferences.codexEnabled : preferences.claudeEnabled;
}

function selectVisibleDetections(
  detections: WorkingLightDetection[],
  preferences: WorkingLightPreferences,
): WorkingLightDetection[] {
  return detections.filter((detection) => detection.detected && isAgentEnabled(detection.agent, preferences));
}

export function WorkingLightApp() {
  const [state, setState] = useState<WorkingLightStateFile>(DEFAULT_WORKING_LIGHT_STATE);
  const [preferences, setPreferences] = useState<WorkingLightPreferences>(DEFAULT_WORKING_LIGHT_PREFERENCES);
  const [detections, setDetections] = useState<WorkingLightDetection[]>([]);
  const previousStates = useRef<Partial<Record<WorkingLightAgent, WorkingLightAgentState>>>({});
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    const snapshot = await getWorkingLightSnapshot();
    setState(snapshot.state);
    setPreferences(snapshot.preferences);
    setDetections(snapshot.detections);

    if (initialized.current && !snapshot.preferences.muted) {
      (Object.entries(snapshot.state.agents) as Array<[WorkingLightAgent, { state: WorkingLightAgentState }]>).forEach(
        ([agent, status]) => {
          if (
            isAgentEnabled(agent, snapshot.preferences) &&
            previousStates.current[agent] &&
            previousStates.current[agent] !== status.state &&
            status.state !== 'idle'
          ) {
            playStateSound(status.state);
          }
          previousStates.current[agent] = status.state;
        },
      );
    } else {
      (Object.entries(snapshot.state.agents) as Array<[WorkingLightAgent, { state: WorkingLightAgentState }]>).forEach(
        ([agent, status]) => {
          previousStates.current[agent] = status.state;
        },
      );
      initialized.current = true;
    }

    const visibleCount = Math.max(selectVisibleDetections(snapshot.detections, snapshot.preferences).length, 1);
    await resizeWorkingLightWindow(visibleCount);
  }, []);

  useEffect(() => {
    let mounted = true;
    const runRefresh = async () => {
      try {
        if (mounted) {
          await refresh();
        }
      } catch (error) {
        console.error(error);
      }
    };

    void runRefresh();
    const timer = window.setInterval(() => void runRefresh(), 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const activeDetections = useMemo(() => selectVisibleDetections(detections, preferences), [detections, preferences]);

  async function toggleMuted(): Promise<void> {
    const next = await setWorkingLightMuted(!preferences.muted);
    setPreferences(next);
  }

  function handleShellPointerDown(event: PointerEvent<HTMLElement>): void {
    if (event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    void startWindowDragging();
  }

  return (
    <main className="working-light-shell" data-tauri-drag-region onPointerDown={handleShellPointerDown}>
      <section className={`working-light-grid count-${Math.max(activeDetections.length, 1)}`} aria-label="工作状态">
        {activeDetections.length === 0 ? (
          <WorkingLightEmptyColumn preferences={preferences} />
        ) : (
          activeDetections.map((detection) => (
            <WorkingLightAgentColumn
              key={detection.agent}
              label={detection.label}
              status={state.agents[detection.agent]}
              preferences={preferences}
            />
          ))
        )}
      </section>
      <div className="working-light-controls" aria-label="窗口控制">
        <button
          className="working-light-icon-button"
          type="button"
          aria-label={preferences.muted ? '取消静音' : '静音'}
          title={preferences.muted ? '取消静音' : '静音'}
          onClick={() => void toggleMuted()}
        >
          {preferences.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <button
          className="working-light-icon-button"
          type="button"
          aria-label="隐藏"
          title="隐藏"
          onClick={() => void hideWorkingLightWindow()}
        >
          <Minus size={13} />
        </button>
        <button
          className="working-light-icon-button close"
          type="button"
          aria-label="关闭"
          title="关闭"
          onClick={() => void closeWorkingLightWindow()}
        >
          <X size={13} />
        </button>
      </div>
    </main>
  );
}
