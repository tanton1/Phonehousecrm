import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { reportClientError } from './services/observabilityClient.ts';
import CustomerPortalApp from './customer/CustomerPortalApp.tsx';

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

const isCustomerPortal = window.location.pathname === '/khach-hang' || window.location.pathname.startsWith('/khach-hang/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isCustomerPortal ? <CustomerPortalApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);

