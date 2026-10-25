import { z } from 'zod';
import { request } from './client';

export const choirSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  is_public: z.boolean(),
  show_member_count: z.boolean(),
  member_count: z.number().nullable(),
  role: z.enum(['Member', 'Planner']).nullable(),
});
export type Choir = z.infer<typeof choirSchema>;
export type ChoirInput = {
  name: string;
  description: string;
  is_public: boolean;
  show_member_count: boolean;
};
export const choirDetailSchema = choirSchema.extend({
  members: z.array(
    z.object({
      id: z.number(),
      user_id: z.number(),
      username: z.string(),
      role: z.enum(['Member', 'Planner']),
    }),
  ),
  code: z.string().optional(),
  requests: z
    .array(z.object({ id: z.number(), username: z.string(), status: z.string() }))
    .optional(),
});
export const applicationSchema = z.object({
  id: z.number(),
  choir_id: z.number(),
  choir_name: z.string(),
  status: z.string(),
});
export const fetchChoirs = () => request('/choirs/', z.array(choirSchema));
export const fetchChoir = (id: string) => request(`/choirs/${id}/`, choirDetailSchema);
export const fetchDirectory = (q: string, page = 1) =>
  request(
    `/choirs/directory/?q=${encodeURIComponent(q)}&page=${page}`,
    z.object({
      count: z.number(),
      next: z.string().nullable(),
      previous: z.string().nullable(),
      results: z.array(choirSchema),
    }),
  );
export const lookupCode = (code: string) =>
  request('/choirs/lookup-code/', choirSchema, { method: 'POST', body: JSON.stringify({ code }) });
export const saveChoir = (data: ChoirInput, id?: number) =>
  request(id ? `/choirs/${id}/` : '/choirs/', choirSchema, {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(data),
  });
export const joinChoir = (choir_id: number, code?: string) =>
  request('/choirs/requests/', z.object({ id: z.number(), status: z.string() }), {
    method: 'POST',
    body: JSON.stringify({ choir_id, ...(code ? { code } : {}) }),
  });
export const fetchApplications = () => request('/choirs/requests/', z.array(applicationSchema));
export const fetchPendingRequests = (page = 1) =>
  request(
    `/choirs/pending-requests/?page=${page}`,
    z.object({
      count: z.number(),
      next: z.string().nullable(),
      previous: z.string().nullable(),
      results: z.array(
        z.object({
          id: z.number(),
          choir_id: z.number(),
          choir_name: z.string(),
          username: z.string(),
        }),
      ),
    }),
  );
export const cancelApplication = (id: number) =>
  request(`/choirs/requests/${id}/cancel/`, z.undefined(), { method: 'POST', body: '{}' });
export const decideApplication = (choir: number, id: number, status: 'approved' | 'declined') =>
  request(`/choirs/${choir}/requests/${id}/decide/`, z.undefined(), {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
export const changeMember = (choir: number, id: number, role?: 'Member' | 'Planner') =>
  request(`/choirs/${choir}/members/${id}/`, z.undefined(), {
    method: role ? 'PATCH' : 'DELETE',
    ...(role ? { body: JSON.stringify({ role }) } : {}),
  });
export const regenerateCode = (id: number) =>
  request(`/choirs/${id}/regenerate-code/`, z.object({ code: z.string() }), {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
