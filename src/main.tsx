import { render } from 'preact';
import { App } from './app';
import { captureInstallPrompt } from './alerts';
import './styles.css';

captureInstallPrompt();
render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker failed', err));
  });
  if (navigator.storage?.persist) void navigator.storage.persist();
}
