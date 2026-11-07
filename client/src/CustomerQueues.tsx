import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { queueRequest, QueueError } from './queue-api';
import type { QueueEntry, QueueInfo } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { QueueNumberDisplay } from './QueueNumberDisplay';
import { BackLink, Button, Card, DetailList, EmptyState, ErrorState, FooterMeta, FormField, InlineNotice, PageHeader } from './components/ui';
export function CustomerQueues({ myQueue, onUnauthenticated }: { myQueue: boolean; onUnauthenticated: () => void }) {
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const load = useCallback(async () => {
    const [queues, entry] = await Promise.all([myQueue ? Promise.resolve([] as QueueInfo[]) : queueRequest<QueueInfo[]>('/queues'), queueRequest<QueueEntry | null>('/customer/entries/latest')]);
    if (myQueue) setUpdatedAt(new Date()); // Local receipt time, not another API field.
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
  const Container = myQueue ? Card : 'section';
  const EntryContainer = myQueue ? Fragment : Card;
  const cardProps = myQueue ? { title: 'My queue', titleAs: 'h1' as const, titleId: 'queues-title', badge: entry?.queueCode ?? '—' } : {};
  return <Container {...cardProps} className={myQueue ? 'customer-status' : 'customer-queues'} aria-labelledby="queues-title">
    <>{!myQueue && <PageHeader id="queues-title">Join Restaurant Queue</PageHeader>}</>
    {message && <InlineNotice>{message}</InlineNotice>}
    {resource.loading ? <div className="queue-loading" role="status"><p>Loading queue information…</p>{myQueue && <div className="queue-skeleton" aria-hidden="true"><span /><span /><span /></div>}</div> : <>
      {Boolean(resource.error) && <ErrorState className="queue-load-error" title={myQueue ? 'Queue status unavailable' : 'Unable to load queues'} helper={resource.error instanceof QueueError && resource.error.status === 403 ? 'Access denied.' : myQueue && resource.error instanceof QueueError && resource.error.status === 404 ? 'Queue entry not found.' : 'Unable to load your queue information. Please try again.'} onRetry={resource.retry} pending={resource.refreshing} />}
      {!resource.error && <>
        {entry && <EntryContainer>
          <QueueNumberDisplay number={entry.displayNumber} status={entry.status} />
          {myQueue ? <DetailList items={[
            { label: 'Queue', value: <>Queue {entry.queueCode ?? '—'}</> },
            { label: 'Party size', value: entry.partySize },
            { label: 'Joined', value: <><time dateTime={entry.joinedAt}>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date(entry.joinedAt))}</time><small>Bangkok time</small></> },
          ]} /> : <p>Party size: {entry.partySize}</p>}
          {!myQueue && <a className="ui-ghost-link" href="/my-queue">View my queue</a>}
        </EntryContainer>}
        {myQueue ? <>
          {!entry && <EmptyState className="queue-empty" title="You have no queue entry." helper="Join a queue to see your number and status here." />}
          <div className="customer-queue-actions"><Button variant="secondary" className="secondary" onClick={resource.retry} disabled={resource.refreshing} pending={resource.refreshing}>Refresh status</Button><a className="ui-back-link" href="/queues"><BackLink>Back to queues</BackLink></a></div>
        </> : !active && <>
          <Card className="card queue-form" title={queue?.name} badge={queue?.code} titleAs="h3">
            {queues.length === 0 && <p>No open queues are available.</p>}
            {queue ? <p>Queue {queue.code} · {queue.state}</p> : <p role="status">Queue {queueCode} is not open for joining.</p>}
            <form onSubmit={submit} noValidate aria-busy={pending}>
              <FormField id="party-size" label="Party size" error={fieldError} errorId="party-error" alwaysError>
              <input id="party-size" name="partySize" type="number" min="1" max="8" step="1" inputMode="numeric" required value={partySize} onChange={event => setPartySize(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldError)} aria-describedby="party-help party-error" />
              <p id="party-help">Parties of 1–4 use Queue R; parties of 5–8 use Queue S.</p></FormField>
              <Button type="submit" disabled={pending || !queue} pending={pending}>{pending ? 'Joining…' : 'Join queue'}</Button><span role="status">{pending ? 'Joining the queue. Please wait.' : ''}</span>
            </form>
          </Card>
        </>}
        {!myQueue && !entry && <p><a className="ui-ghost-link" href="/my-queue">View my queue</a></p>}
      </>}
    </>}
    {myQueue && <FooterMeta updatedAt={updatedAt} className="customer-queue-updated" />}
  </Container>;
}
