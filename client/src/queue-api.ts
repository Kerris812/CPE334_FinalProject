import { requestData } from './api-client';
export interface QueueInfo { id: string; code: string; name: string; state: string }
export interface QueueEntry { id: string; displayNumber: string; partySize: number; status: string; joinedAt: string; queueCode?: string; calledAt?: string | null; servingAt?: string | null; completedAt?: string | null }
export interface PublicBoard { queueCode: string; calledNumber: string | null; serviceState: string | null; waitingCount: number }
export { HttpError as QueueError } from './api-client';
export async function queueRequest<T>(path: string, body?: { partySize: number }): Promise<T> {
  return await requestData<T>(path, body) as T;
}
