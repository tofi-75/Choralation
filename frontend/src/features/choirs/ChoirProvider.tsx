import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fetchChoirs } from '../../api/choirs';
import type { Choir } from '../../api/choirs';
import { useSession } from '../auth/SessionProvider';

type ChoirContext = {
  active: Choir | null;
  choirs: Choir[];
  select: (id: number | null, destination?: string) => Promise<void>;
  refresh: () => Promise<unknown>;
};
const Context = createContext<ChoirContext>({
  active: null,
  choirs: [],
  select: async () => {},
  refresh: async () => {},
});
export const useChoir = () => useContext(Context);

export function ChoirProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { user } = useSession();
  const storageKey = `choralation-choir-${user?.id}`;
  const [id, setId] = useState<number | null | undefined>(undefined);
  const [switching, setSwitching] = useState(false);
  const query = useQuery({ queryKey: ['choirs'], queryFn: fetchChoirs, refetchInterval: 60_000 });
  const active = query.data?.find((c) => c.id === id) ?? null;
  useEffect(() => {
    if (!query.data) return;
    if (id === undefined) {
      let preferred: number | null = null;
      try {
        preferred = Number(sessionStorage.getItem(storageKey));
      } catch {
        /* Storage is optional. */
      }
      const next = query.data.find((c) => c.id === preferred)?.id ?? query.data[0]?.id ?? null;

      setId(next);
      return;
    }
    if (id !== null && !query.data.some((c) => c.id === id)) {
      void client.cancelQueries({
        predicate: (q) => !['session', 'choirs'].includes(String(q.queryKey[0])),
      });
      client.removeQueries({
        predicate: (q) => !['session', 'choirs'].includes(String(q.queryKey[0])),
      });

      setId(null);
      navigate('/choirs', { replace: true });
    }
  }, [query.data, id, client, navigate, storageKey]);
  useEffect(() => {
    const refresh = () => {
      void query.refetch();
    };
    window.addEventListener('choralation:choir-access', refresh);
    return () => {
      window.removeEventListener('choralation:choir-access', refresh);
    };
  }, [query.refetch]);
  async function select(next: number | null, destination = '/dashboard') {
    if (next === id) return;
    if (!window.dispatchEvent(new Event('choralation:before-signout', { cancelable: true })))
      return;
    setSwitching(true);
    await client.cancelQueries({
      predicate: (q) => !['session', 'choirs'].includes(String(q.queryKey[0])),
    });
    client.removeQueries({
      predicate: (q) => !['session', 'choirs'].includes(String(q.queryKey[0])),
    });

    try {
      sessionStorage.setItem(storageKey, String(next ?? ''));
    } catch {
      /* Storage is optional. */
    }
    setId(next);
    navigate(destination);
    setSwitching(false);
  }
  if (query.error)
    return (
      <section role="alert">
        <p>{query.error.message}</p>
        <button className="button secondary" onClick={() => void query.refetch()}>
          Retry choirs
        </button>
      </section>
    );
  if (query.isPending || switching || id === undefined) return <p role="status">Loading choirs…</p>;
  return (
    <Context.Provider value={{ active, choirs: query.data ?? [], select, refresh: query.refetch }}>
      <div key={id ?? 'no-choir'}>{children}</div>
    </Context.Provider>
  );
}
