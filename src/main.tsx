import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { WorkingLightApp } from './components/working-light/WorkingLightApp';
import { initTheme } from './stores/useThemeStore';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/utilities.css';
import './styles/dialog-motion.css';
import './components/working-light/WorkingLightApp.css';

function getTauriWindowLabel(): string | null {
  const metadata = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata;
  return metadata?.currentWindow?.label ?? null;
}

const isWorkingLightWindow = getTauriWindowLabel() === 'working-light';

if (isWorkingLightWindow) {
  document.documentElement.dataset.window = 'working-light';
} else {
  initTheme();
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {isWorkingLightWindow ? <WorkingLightApp /> : <App />}
  </StrictMode>,
);
