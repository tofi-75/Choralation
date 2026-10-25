/**
 * One query owns authenticated identity. Session expiry clears private query data
 * before redirecting, while permission failures stay visible on their own screen.
 * Login/logout failures never pretend a server session changed successfully.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

import { currentUser } from '../../api/auth';
import type { User } from '../../api/auth';
import { ApiError, clearCsrfToken } from '../../api/client';

const sessionKey = ['session'] as const;
type Session = {
  user: User | null;
  pending: boolean;
  error: Error | null;
  retry: () => void;
  acceptUser: (user: User) => void;
  clearSession: () => void;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await currentUser();
      } catch (error) {
        if (error instanceof ApiError && error.code === 'not_authenticated') return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const refresh = () => {
      void query.refetch();
    };
    const expired = () => {
      void client.cancelQueries({ queryKey: sessionKey });
      client.setQueryData(sessionKey, null);
    };
    window.addEventListener('choralation:session-refresh', refresh);
    window.addEventListener('choralation:session-expired', expired);
    return () => {
      window.removeEventListener('choralation:session-refresh', refresh);
      window.removeEventListener('choralation:session-expired', expired);
    };
  }, [query.refetch, client]);

  useEffect(() => {
    if (query.data === null) {
      clearCsrfToken();
      client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== 'session' });
    }
  }, [client, query.data]);

  useEffect(() => {
    return client.getQueryCache().subscribe((event) => {
      const error = event.query.state.error;
      if (
        event.query.queryKey[0] !== 'auth-config' &&
        error instanceof ApiError &&
        error.code === 'not_authenticated'
      ) {
        client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== 'session' });
        client.setQueryData(sessionKey, null);
      }
    });
  }, [client]);

  return (
    <SessionContext.Provider
      value={{
        user: query.data ?? null,
        pending: query.isPending,
        error: query.error,
        retry: () => void query.refetch(),
        acceptUser: (user) => {
          // Cancel an older /me refetch before publishing the newly signed-in user.
          void client.cancelQueries({ queryKey: sessionKey });
          client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== 'session' });
          client.setQueryData(sessionKey, user);
        },
        clearSession: () => {
          // An in-flight identity response must not restore the signed-out shell.
          void client.cancelQueries({ queryKey: sessionKey });
          client.removeQueries({ predicate: (entry) => entry.queryKey[0] !== 'session' });
          client.setQueryData(sessionKey, null);
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/** Read identity through the provider, avoiding duplicate ad-hoc /me requests. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requires SessionProvider');
  return session;
}
