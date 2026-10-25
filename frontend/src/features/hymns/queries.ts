import { useChoirQuery } from '../choirs/useChoirQuery';
/** Query keys own saved data; refresh library/detail together after a successful write. */
import { useQueryClient } from '@tanstack/react-query';

import { fetchCategories, fetchHymn } from '../../api/library';

export function useCategories() {
  return useChoirQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: 30_000 });
}
export function useHymn(id?: string) {
  return useChoirQuery({
    queryKey: ['hymn', id],
    queryFn: (choirId) => fetchHymn(id!, choirId),
    enabled: Boolean(id),
  });
}
export function useRefreshLibrary() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['hymns'] }),
      client.invalidateQueries({ queryKey: ['hymn'] }),
      client.invalidateQueries({ queryKey: ['categories'] }),
    ]);
  };
}
