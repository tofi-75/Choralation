import { z } from 'zod';
import { request } from './client';

const managerRequest = z.object({
  id: z.number(),
  username: z.string(),
  status: z.enum(['pending', 'approved', 'declined']),
  requested_at: z.string(),
  decided_at: z.string().nullable(),
});
const ownRequest = z.object({
  request: managerRequest.nullable(),
  can_create_choirs: z.boolean(),
});
const queue = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(managerRequest),
});

export type ManagerDecision = 'approved' | 'declined';

export const fetchMyManagerRequest = () => request('/auth/manager-requests/me/', ownRequest);

export const submitManagerRequest = () =>
  request('/auth/manager-requests/me/', ownRequest, { method: 'POST', body: '{}' });

export const fetchManagerRequests = (page: number) =>
  request(`/auth/manager-requests/?page=${page}`, queue);

export const decideManagerRequest = (id: number, status: ManagerDecision) =>
  request(`/auth/manager-requests/${id}/decide/`, z.undefined(), {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
