import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { loadNativeSettings } from './native/nativeSettings';

/**
 * Starts the app. A phone app first reads its saved connection settings, because the database it opens
 * depends on them.
 */
async function start() {
  const root = createRoot(document.getElementById('root')!);
  try {
    if (Capacitor.isNativePlatform()) await loadNativeSettings();
  } catch (error) {
    root.render(<p style={{ padding: 24, fontFamily: 'sans-serif' }}>{(error as Error).message}</p>);
    return;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
