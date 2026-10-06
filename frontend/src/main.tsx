/** Mount shared server-query/session providers once for every application route. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { SessionProvider } from './features/auth/SessionProvider';
import './styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      {/* URL-controlled inputs need immediate navigation state; queries show their own loading UI. */}
      <BrowserRouter useTransitions={false}>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
