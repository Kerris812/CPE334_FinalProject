import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError, requestData } from './api-client';
import type { QueueInfo, QueueEntry } from './queue-api';
import { useQueueResource } from './useQueueResource';
interface Desk { queue: QueueInfo; waitingCount: number; activeEntry: QueueEntry | null; nextWaiting: Pick<QueueEntry, 'id' | 'displayNumber' | 'partySize' | 'status'> | null }
function errorText(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status === 403) return 'You do not have permission to access this queue.';
    const conflicts: Record<string, string> = { QUEUE_EMPTY: 'There are no waiting customers.', SERVICE_SLOT_BUSY: 'Finish the active service before calling next.', INVALID_TRANSITION: 'This action is no longer valid. The desk has been refreshed.', QUEUE_NOT_OPEN: 'This queue is not open.' };
    if (conflicts[error.code]) return conflicts[error.code];
  }
  return 'Unable to load the operator desk. Please retry.';
}
export function OperatorDesk({ onUnauthenticated }: { onUnauthenticated: () => void }) {
  const load = useCallback(async () => (await requestData<QueueInfo[]>('/operator/queues')) ?? [], []);
  const resource = useQueueResource(load);
  const [selected, setSelected] = useState('');
  useEffect(() => { if (resource.error instanceof HttpError && resource.error.status === 401) onUnauthenticated(); }, [resource.error, onUnauthenticated]);
  const queues = resource.data ?? [];
  const queueId = queues.some(q => q.id === selected) ? selected : queues[0]?.id;
  return <section className="operator-desk"><h2>Operator desk</h2>
    {resource.loading ? <p role="status">Loading assigned queues…</p> : resource.error ? <><p role="alert">{errorText(resource.error)}</p><button onClick={resource.retry}>Retry</button></> : queues.length === 0 ? <p>No assigned queues.</p> : <>
      <label htmlFor="assigned-queue">Assigned queue</label>{' '}<select id="assigned-queue" value={queueId} onChange={e => setSelected(e.target.value)}>{queues.map(q => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}</select>
      {queueId && <ServiceDesk key={queueId} queueId={queueId} onUnauthenticated={onUnauthenticated} />}
    </>}
  </section>;
}
function ServiceDesk({ queueId, onUnauthenticated }: { queueId: string; onUnauthenticated: () => void }) {
  const load = useCallback(async () => (await requestData<Desk>(`/operator/queues/${queueId}/desk`))!, [queueId]);
  const resource = useQueueResource(load, true);
  const [pending, setPending] = useState(false);
  const gate = useRef(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  useEffect(() => { if (resource.error instanceof HttpError && resource.error.status === 401) onUnauthenticated(); }, [resource.error, onUnauthenticated]);
  async function act(name: 'call-next' | 'start-service' | 'complete') {
    if (gate.current || !resource.data || resource.loading || resource.error) return;
    gate.current = true; setPending(true); setMessage(''); setFailure(null);
    const entry = resource.data.activeEntry;
    try {
      await requestData(name === 'call-next' ? `/operator/queues/${queueId}/call-next` : `/operator/entries/${entry!.id}/${name}`, {});
      setMessage(name === 'complete' ? 'Service completed.' : name === 'start-service' ? 'Service started.' : 'Next customer called.');
    } catch (error) { if (error instanceof HttpError && error.status === 401) onUnauthenticated(); else setFailure(error); }
    finally { resource.retry(); gate.current = false; setPending(false); }
  }
  const data = resource.data;
  const blocked = pending || resource.refreshing;
  return <div aria-busy={pending || resource.loading}>
    <button className="secondary desk-refresh" disabled={blocked} onClick={resource.retry}>Refresh</button>
    {pending && <p role="status">Saving service update…</p>}
    {message && <p role="status">{message}</p>}{failure != null && <p role="alert">{errorText(failure)}</p>}
    {resource.loading ? <p role="status">Loading operator desk…</p> : resource.error ? <><p role="alert">{errorText(resource.error)}</p><button onClick={resource.retry}>Retry</button></> : data && <div className="desk-grid">
      <section className="desk-card"><h3>Waiting</h3><p>Queue state: {data.queue.state}</p><p>Waiting customers <strong className="waiting-count">{data.waitingCount}</strong></p>
        {data.nextWaiting ? <p>Next waiting number: {data.nextWaiting.displayNumber}</p> : <p>No waiting customers.</p>}
        {data.activeEntry && <p>Finish the active service before calling next.</p>}
        {data.queue.state !== 'OPEN' && <p>This queue is not open for new calls.</p>}
        <button disabled={blocked || data.queue.state !== 'OPEN' || data.waitingCount === 0 || !!data.activeEntry} onClick={() => void act('call-next')}>Call Next</button>
      </section>
      <section className="desk-card" aria-live="polite"><h3>Active Service</h3><p>Active: {data.activeEntry ? 1 : 0}/1</p>{data.activeEntry ? <><p>Current queue number</p><strong className="queue-number">{data.activeEntry.displayNumber}</strong><p className={`queue-status status-${data.activeEntry.status.toLowerCase()}`}>{data.activeEntry.status}</p><p>Party size: {data.activeEntry.partySize}</p></> : <p>No active service.</p>}
        <div className="desk-actions"><button disabled={blocked || data.activeEntry?.status !== 'CALLED'} onClick={() => void act('start-service')}>Start Service</button><button disabled={blocked || data.activeEntry?.status !== 'SERVING'} onClick={() => void act('complete')}>Complete Service</button></div>
      </section>
    </div>}
  </div>;
}
