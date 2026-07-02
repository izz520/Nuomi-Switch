import { type PointerEvent, useRef } from 'react';
import { WorkingLightTrafficLight } from './WorkingLightTrafficLight';
import {
  WORKING_LIGHT_STATE_LABELS,
  type WorkingLightAgentStatus,
  type WorkingLightPreferences,
} from '../../types/workingLight';

const DRAG_THRESHOLD_PX = 4;

interface WorkingLightAgentColumnProps {
  label: string;
  status: WorkingLightAgentStatus;
  preferences: WorkingLightPreferences;
  onActivate?: () => void;
  onStartDrag?: () => void;
}

export function WorkingLightAgentColumn({
  label,
  status,
  preferences,
  onActivate,
  onStartDrag,
}: WorkingLightAgentColumnProps) {
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const content = (
    <>
      <WorkingLightTrafficLight status={status} waitingBlinkSeconds={preferences.waitingBlinkSeconds} />
      <span className="working-light-copy">
        <span className="working-light-agent-name">{label}</span>
        <span className={`working-light-state-label ${status.state}`} aria-live="polite">
          {WORKING_LIGHT_STATE_LABELS[status.state]}
        </span>
      </span>
    </>
  );

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    suppressClick.current = false;
    dragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (!dragStart.current) {
      return;
    }
    event.stopPropagation();
    const deltaX = event.clientX - dragStart.current.x;
    const deltaY = event.clientY - dragStart.current.y;
    if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
      return;
    }

    suppressClick.current = true;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onStartDrag?.();
  }

  function handlePointerEnd(event: PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleClick(): void {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onActivate?.();
  }

  if (onActivate) {
    return (
      <button
        className={`working-light-agent ${status.state} clickable`}
        type="button"
        aria-label={`显示 ${label}`}
        title={`显示 ${label}`}
        onClick={handleClick}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        {content}
      </button>
    );
  }

  return (
    <article
      className={`working-light-agent ${status.state}`}
      aria-label={`${label} ${WORKING_LIGHT_STATE_LABELS[status.state]}`}
      title={`${label} · ${WORKING_LIGHT_STATE_LABELS[status.state]}`}
    >
      {content}
    </article>
  );
}
