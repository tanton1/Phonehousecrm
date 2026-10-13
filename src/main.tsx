import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { reportClientError } from './services/observabilityClient.ts';
const App = lazy(() => import('./App.tsx'));
const CustomerPortalApp = lazy(() => import('./customer/CustomerPortalApp.tsx'));
const StorefrontApp = lazy(() => import('./storefront/StorefrontApp.tsx'));

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
const isStorefront = window.location.pathname === '/cua-hang' || window.location.pathname.startsWith('/cua-hang/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div style={{ padding: 32, textAlign: 'center' }}>Đang mở PhoneHouse…</div>}>
        {isStorefront ? <StorefrontApp /> : isCustomerPortal ? <CustomerPortalApp /> : <App />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);

