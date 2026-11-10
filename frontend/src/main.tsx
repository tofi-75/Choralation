/** Mount shared server-query/session providers once for every application route. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { ConfirmationProvider } from './components/ConfirmationProvider';
import { App } from './App';
import { SessionProvider } from './features/auth/SessionProvider';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const router = createBrowserRouter([{ path: '*', element: <App /> }]);
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <SessionProvider>
        <ConfirmationProvider>
          <RouterProvider router={router} useTransitions={false} />
        </ConfirmationProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
