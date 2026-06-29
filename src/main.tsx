import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './stores/useThemeStore';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/layout.css';
import './styles/utilities.css';
import './styles/dialog-motion.css';

initTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
