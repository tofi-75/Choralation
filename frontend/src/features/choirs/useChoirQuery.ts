import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { useChoir } from './ChoirProvider';

/** Request context and cache identity come from the same render, including in-flight reads. */
export function useChoirQuery<T>(
  options: Omit<UseQueryOptions<T>, 'queryFn'> & {
    queryFn: (choirId: number | null) => Promise<T>;
  },
) {
  const { active } = useChoir();
  const id = active?.id ?? null;
  return useQuery({
    ...options,
    queryKey: [...options.queryKey, id],
    queryFn: () => options.queryFn(id),
  });
}
