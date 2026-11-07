export class HttpError extends Error {
  constructor(public status: number, public code: string, public fields: Record<string, string> = {}) { super(code); }
}
export async function requestData<T>(path: string, body?: unknown): Promise<T | null> {
  const response = await fetch(`/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new HttpError(response.status, payload?.error?.code ?? 'CONNECTION_ERROR', payload?.error?.details?.fields ?? {});
  }
  if (response.status === 204) return null;
  return (await response.json()).data;
}
