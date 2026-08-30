import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { reportClientError } from './services/observabilityClient.ts';

window.addEventListener('error', event => {
  reportClientError({
    name: event.error?.name || 'WindowError',
    message: event.error?.message || event.message,
    stack: event.error?.stack
  });
});

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  reportClientError({
    name: reason?.name || 'UnhandledRejection',
    message: reason?.message || String(reason || 'Promise rejection'),
    stack: reason?.stack
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

