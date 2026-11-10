import type { QueryClient } from '@tanstack/react-query';

export function refreshMassUsage(client: QueryClient) {
  return Promise.all(
    [
      'mass',
      'masses',
      'mass-history',
      'hymns',
      'hymn',
      'hymn-usage',
      'dashboard',
      'recommendations',
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
