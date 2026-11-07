import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { queueRequest, QueueError } from './queue-api';
import type { QueueEntry, QueueInfo } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { QueueNumberDisplay } from './QueueNumberDisplay';
export function CustomerQueues({ myQueue, onUnauthenticated }: { myQueue: boolean; onUnauthenticated: () => void }) {
  const load = useCallback(async () => {
    const [queues, entry] = await Promise.all([myQueue ? Promise.resolve([] as QueueInfo[]) : queueRequest<QueueInfo[]>('/queues'), queueRequest<QueueEntry | null>('/customer/entries/latest')]);
    return { queues, entry };
  }, [myQueue]);
  const resource = useQueueResource(load, myQueue);
  const [joined, setJoined] = useState<QueueEntry | null>(null);
  const [partySize, setPartySize] = useState('4');
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const queues = resource.data?.queues ?? [];
  const queueCode = Number(partySize) >= 5 && Number(partySize) <= 8 ? 'S' : 'R';
  const queue = queues.find(value => value.code === queueCode && value.state === 'OPEN');
  const entry = myQueue ? resource.data?.entry : joined ?? resource.data?.entry;
  useEffect(() => { if (resource.error instanceof QueueError && resource.error.status === 401) onUnauthenticated(); }, [resource.error, onUnauthenticated]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    setFieldError(''); setMessage('');
    const value = Number(partySize);
    if (!partySize.trim() || !Number.isInteger(value) || value < 1 || value > 8) { setFieldError('Must be an integer from 1 to 8.'); document.getElementById('party-size')?.focus(); return; }
    if (!queue) return;
    submitting.current = true; setPending(true);
    try { setJoined(await queueRequest<QueueEntry>(`/queues/${queue.id}/entries`, { partySize: value })); }
    catch (error) {
      if (error instanceof QueueError && error.status === 401) { onUnauthenticated(); return; }
      if (error instanceof QueueError && error.code === 'DUPLICATE_ACTIVE_ENTRY') {
        setMessage('You already have an active queue entry.');
        try { setJoined(await queueRequest<QueueEntry | null>('/customer/entries/latest')); }
        catch (failure) { if (failure instanceof QueueError && failure.status === 401) onUnauthenticated(); else setMessage('You already have an active queue entry. Open My queue to refresh its status.'); }
      } else if (error instanceof QueueError && error.code === 'QUEUE_NOT_OPEN') { setMessage('This queue is no longer open. Please refresh or try again later.'); resource.retry(); }
      else if (error instanceof QueueError && error.status === 422) setFieldError(error.fields.partySize ?? 'Check the party size and try again.');
      else if (error instanceof QueueError && error.status === 403) setMessage('You do not have permission to join this queue.');
      else setMessage('Unable to join the queue. Please try again.');
    } finally { submitting.current = false; setPending(false); }
  }
  const active = entry && ['WAITING', 'CALLED', 'SERVING'].includes(entry.status);
  return <section aria-labelledby="queues-title">
    <h2 id="queues-title">{myQueue ? 'My queue' : 'Queues'}</h2>
    {message && <p role="alert">{message}</p>}
    {resource.loading ? <p role="status">Loading queue information…</p> : <>
      {Boolean(resource.error) && <><p role="alert">{resource.error instanceof QueueError && resource.error.status === 403 ? 'Access denied.' : myQueue && resource.error instanceof QueueError && resource.error.status === 404 ? 'Queue entry not found.' : 'Unable to load your queue information. Please try again.'}</p><button onClick={resource.retry} disabled={resource.refreshing}>Retry</button></>}
      {!resource.error && <>
        {entry && <>
          <QueueNumberDisplay number={entry.displayNumber} status={entry.status} />
          <p>Party size: {entry.partySize}</p>
          {myQueue && <dl className="queue-times"><dt>Joined</dt><dd>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(entry.joinedAt))}</dd></dl>}
          {!myQueue && <a href="/my-queue">View my queue</a>}
        </>}
        {myQueue ? <>
          {!entry && <p>You have no queue entry.</p>}
          <p><button className="secondary" onClick={resource.retry} disabled={resource.refreshing}>Refresh status</button></p><a href="/queues">Back to queues</a>
        </> : !active && <>
          <div className="card queue-form">
            {queues.length === 0 && <p>No open queues are available.</p>}
            {queue ? <><h3>{queue.name}</h3><p>Queue {queue.code} · {queue.state}</p></> : <p role="status">Queue {queueCode} is not open for joining.</p>}
            <form onSubmit={submit} noValidate aria-busy={pending}>
              <label htmlFor="party-size">Party size</label>
              <input id="party-size" name="partySize" type="number" min="1" max="8" step="1" inputMode="numeric" required value={partySize} onChange={event => setPartySize(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldError)} aria-describedby="party-help party-error" />
              <p id="party-help">Parties of 1–4 use Queue R; parties of 5–8 use Queue S.</p><p id="party-error" className="error" role={fieldError ? 'alert' : undefined}>{fieldError}</p>
              <button type="submit" disabled={pending || !queue}>{pending ? 'Joining…' : 'Join queue'}</button><span role="status">{pending ? 'Joining the queue. Please wait.' : ''}</span>
            </form>
          </div>
        </>}
        {!myQueue && !entry && <p><a href="/my-queue">View my queue</a></p>}
      </>}
    </>}
  </section>;
}
