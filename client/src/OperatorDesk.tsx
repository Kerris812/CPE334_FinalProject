import { useCallback, useEffect, useRef, useState } from 'react';
import { HttpError, requestData } from './api-client';
import type { QueueInfo, QueueEntry, ServiceCounter } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { Button, Card, EmptyState, ErrorState, InlineNotice, PageHeader, StatBlock } from './components/ui';
import { NoShowControl, TerminationControl } from './components/TerminationControl';
import { QueueNumberDisplay } from './QueueNumberDisplay';
interface Desk { asOf?: string; queue: QueueInfo; counter?: ServiceCounter | null; activeEntries?: QueueEntry[]; waitingCount: number; activeEntry: QueueEntry | null; nextWaiting: Pick<QueueEntry, 'id' | 'displayNumber' | 'partySize' | 'status'> | null }
function errorText(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status === 403) return 'You do not have permission to access this queue.';
    const conflicts: Record<string, string> = { QUEUE_EMPTY: 'There are no waiting customers.', SERVICE_SLOT_BUSY: 'Finish the active service before calling next.', QUEUE_HEAD_CHANGED: 'The next waiting entry changed. Review the refreshed queue before calling.', CONCURRENT_UPDATE: 'The queue changed. Review the refreshed counter before trying again.', INVALID_TRANSITION: 'This action is no longer valid. The desk has been refreshed.', QUEUE_NOT_OPEN: 'This queue is not open.' };
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
  return <section className="operator-desk"><PageHeader>Operator desk</PageHeader>
    {resource.loading ? <p role="status">Loading assigned queues…</p> : resource.error ? <ErrorState title={errorText(resource.error)} onRetry={resource.retry} /> : queues.length === 0 ? <EmptyState title="No assigned queues." /> : <>
      <div className="assigned-queue-control"><label htmlFor="assigned-queue">Assigned queue</label><span className="assigned-queue-select"><select id="assigned-queue" value={queueId} onChange={e => setSelected(e.target.value)}>{queues.map(q => <option key={q.id} value={q.id}>{q.code} — {q.name}</option>)}</select><svg className="assigned-queue-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></span></div>
      {queueId && <ServiceDesk key={queueId} queueId={queueId} onUnauthenticated={onUnauthenticated} />}
    </>}
  </section>;
}
function ServiceDesk({ queueId, onUnauthenticated }: { queueId: string; onUnauthenticated: () => void }) {
  const serverSample = useRef<{ at: number; received: number } | undefined>(undefined);
  const load = useCallback(async () => {
    const desk = (await requestData<Desk>(`/operator/queues/${queueId}/desk`))!;
    serverSample.current = { at: desk.asOf ? Date.parse(desk.asOf) : Date.now(), received: performance.now() };
    return desk;
  }, [queueId]);
  const serverTime = useCallback(() => {
    const sample = serverSample.current;
    return sample ? sample.at + performance.now() - sample.received : Date.now();
  }, []);
  const resource = useQueueResource(load, true);
  const [pending, setPending] = useState(false);
  const gate = useRef(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [terminationFailure, setTerminationFailure] = useState('');
  useEffect(() => { if (resource.error instanceof HttpError && resource.error.status === 401) onUnauthenticated(); }, [resource.error, onUnauthenticated]);
  async function act(name: 'call-next' | 'start-service' | 'complete') {
    if (gate.current || !resource.data || resource.loading || resource.refreshing || resource.error) return;
    if (name === 'call-next' && resource.data.counter !== undefined && (!resource.data.counter || resource.data.counter.status !== 'AVAILABLE' || !resource.data.nextWaiting)) return;
    gate.current = true; setPending(true); setMessage(''); setFailure(null); setTerminationFailure('');
    const entry = resource.data.activeEntry;
    try {
      const body = name === 'call-next' && resource.data.counter && resource.data.nextWaiting ? { counterId: resource.data.counter.id, expectedEntryId: resource.data.nextWaiting.id } : {};
      await requestData(name === 'call-next' ? `/operator/queues/${queueId}/call-next` : `/operator/entries/${entry!.id}/${name}`, body);
      setMessage(name === 'complete' ? 'Service completed.' : name === 'start-service' ? 'Service started.' : 'Next customer called.');
    } catch (error) { if (error instanceof HttpError && error.status === 401) onUnauthenticated(); else setFailure(error); }
    finally { resource.retry(); gate.current = false; setPending(false); }
  }
  const data = resource.data;
  const blocked = pending || resource.refreshing;
  const terminationProps = {
    disabled: blocked, onUnauthenticated, onRefresh: resource.retry,
    onSuccess: (message: string) => { setFailure(null); setTerminationFailure(''); setMessage(message); },
    onFailure: (message: string) => { setMessage(''); setFailure(null); setTerminationFailure(message); },
  };
  return <div aria-busy={pending || resource.loading}>
    <Button variant="secondary" className="secondary desk-refresh" disabled={blocked} onClick={resource.retry} pending={resource.refreshing}>Refresh</Button>
    {pending && <p role="status">Saving service update…</p>}
    {message && <p role="status">{message}</p>}{failure != null && <InlineNotice>{errorText(failure)}</InlineNotice>}{terminationFailure && <InlineNotice>{terminationFailure}</InlineNotice>}
    {resource.loading ? <p role="status">Loading operator desk…</p> : resource.error ? <ErrorState title={errorText(resource.error)} onRetry={resource.retry} /> : data && <><div className="desk-heading"><h3>Restaurant Queue {data.queue.code}</h3><span className={`availability availability-${data.queue.state.toLowerCase()}`}>{data.queue.state}</span></div>
      {data.counter && <Card className="desk-card" title={data.counter.name} titleAs="h3"><p>Counter code: {data.counter.code} · Queue: {data.queue.code}</p><p><strong>{data.counter.status}</strong></p>{data.counter.occupant ? <p>Reservation: {data.counter.occupant.displayNumber} ({data.counter.occupant.status})</p> : <p>No counter reservation.</p>}</Card>}
      {data.counter === null && <InlineNotice>No service counter is configured for this queue.</InlineNotice>}
      <div className="desk-grid ui-grid">
      <Card className="desk-card" title="Waiting Parties" titleAs="h3" badge={data.queue.code}><p>Queue state: {data.queue.state}</p><StatBlock value={data.waitingCount} label="Waiting parties" strong />
        {data.nextWaiting ? <p>Next waiting number: {data.nextWaiting.displayNumber}</p> : <p>No waiting customers.</p>}
        {data.nextWaiting && <TerminationControl key={data.nextWaiting.id} {...terminationProps} action="operator-cancel" entry={data.nextWaiting} />}
        {data.activeEntry && <p>Finish the active service before calling next.</p>}
        {data.queue.state !== 'OPEN' && <p>This queue is not open for new calls.</p>}
        <Button variant={data.activeEntry ? 'secondary' : 'primary'} pending={pending} disabled={blocked || data.queue.state !== 'OPEN' || data.waitingCount === 0 || !!data.activeEntry || (data.counter !== undefined && (!data.counter || data.counter.status !== 'AVAILABLE' || !data.nextWaiting))} onClick={() => void act('call-next')}>Call Next</Button>
      </Card>
      <Card className="desk-card" aria-live="polite" title="Active Service" titleAs="h3" badge="1"><p>Active: {data.activeEntry ? 1 : 0}/1</p>{data.activeEntry ? <><QueueNumberDisplay label="Current queue number" number={data.activeEntry.displayNumber} status={data.activeEntry.status} /><p>Party size: {data.activeEntry.partySize}</p></> : <p>No active service.</p>}
      <div className="service-actions"><h3>Service Actions</h3>{data.activeEntry?.status === 'CALLED' && <NoShowControl key={data.activeEntry.id} {...terminationProps} entry={{ ...data.activeEntry, counterName: data.counter?.name }} serverTime={serverTime} />}<div className="desk-actions"><Button variant={data.activeEntry?.status === 'CALLED' ? 'primary' : 'secondary'} pending={pending && data.activeEntry?.status === 'CALLED'} disabled={blocked || data.activeEntry?.status !== 'CALLED'} onClick={() => void act('start-service')}>Start Service</Button><Button variant={data.activeEntry?.status === 'SERVING' ? 'primary' : 'secondary'} pending={pending && data.activeEntry?.status === 'SERVING'} disabled={blocked || data.activeEntry?.status !== 'SERVING'} onClick={() => void act('complete')}>Complete Service</Button></div></div></Card>
    </div></>}
  </div>;
}
