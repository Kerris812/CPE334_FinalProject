import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { QueueError, queueRequest } from './queue-api';
import type { PublicBoard } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { Button, Card, Divider, EmptyState, ErrorState, FooterMeta, PageHeader, StatBlock, Tabs } from './components/ui';
import { QueueNumberDisplay } from './QueueNumberDisplay';

interface PublicTab { route: string; code: string }
const approvedCodes = ['R', 'S'];

/** Every displayed API value is taken explicitly from the four-field public DTO. */
export function PublicQueueBoard({ queueId, onAvailable, onMissing }: { queueId: string; onAvailable?: (route: string, code: string) => void; onMissing?: (route: string, code?: string) => void }) {
  const titleId = useId();
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const load = useCallback(async () => {
    const result = await queueRequest<PublicBoard>(`/public/queues/${encodeURIComponent(queueId)}/board`);
    const value: PublicBoard = { queueCode: result.queueCode, calledNumber: result.calledNumber, serviceState: result.serviceState, waitingCount: result.waitingCount };
    setUpdatedAt(new Date()); // Local receipt time, never a private database timestamp.
    return value;
  }, [queueId]);
  const resource = useQueueResource(load, true);
  useEffect(() => {
    if (resource.data && !resource.error) onAvailable?.(queueId, resource.data.queueCode);
    else if (resource.error instanceof QueueError && resource.error.status === 404) onMissing?.(queueId, resource.data?.queueCode);
  }, [queueId, resource.data, resource.error, onAvailable, onMissing]);
  const unavailable = resource.error instanceof QueueError && resource.error.status === 404;
  const code = resource.data?.queueCode ?? (approvedCodes.includes(queueId) ? queueId : undefined);
  return <Card headerClassName="public-board-header" badgeClassName={`board-code${code && code.length > 3 ? ' board-code-long' : ''}`} className="public-board" aria-labelledby={titleId} title={code ? `Queue ${code}` : 'Public queue'} titleId={titleId} badge={code ?? '—'} footer={<FooterMeta className="public-board-actions" updatedAt={updatedAt} action={<Button onClick={resource.retry} disabled={resource.refreshing} pending={resource.refreshing}>Refresh</Button>} />}>
    {resource.loading ? <p role="status">Loading public queue status…</p> : resource.error ? <ErrorState className="board-error" title={unavailable ? "This queue isn't available" : "We couldn't load this. Please try again."} helper={unavailable ? 'Please try again or choose another queue.' : 'Please check your connection and try again.'} onRetry={resource.retry} pending={resource.refreshing} /> : resource.data && <>
      {resource.data.calledNumber ? <QueueNumberDisplay number={resource.data.calledNumber} status={resource.data.serviceState} publicDisplay /> : <><EmptyState className="board-empty" title="No one is being called yet" helper="The next called number will appear here." /><Divider /></>}
      <StatBlock value={resource.data.waitingCount} label="guests waiting" live />
    </>}
  </Card>;

}

/** Read-only discovery uses existing anonymous board endpoints; never private queue metadata. */
export function PublicQueueDisplay({ queueId, backButton }: { queueId?: string; backButton?: ReactNode }) {
  const [tabs, setTabs] = useState<PublicTab[]>(() => approvedCodes.map(code => ({ route: code, code })));
  const [selectedCode, setSelectedCode] = useState<string>();
  const available = useCallback((route: string, code: string) => {
    setTabs(previous => previous.some(tab => tab.code === code) ? previous : [...previous, { route, code }]);
    if (route === queueId) setSelectedCode(code);
  }, [queueId]);
  const missing = useCallback((route: string, code?: string) => {
    setTabs(previous => previous.filter(tab => approvedCodes.includes(tab.code) || (tab.route !== route && tab.code !== code)));
    if (route === queueId) setSelectedCode(undefined);
  }, [queueId]);
  useEffect(() => {
    let active = true;
    for (const code of approvedCodes) {
      void queueRequest<PublicBoard>(`/public/queues/${code}/board`).then(board => {
        if (active && board.queueCode === code) available(code, board.queueCode);
      }).catch(() => { /* Keep the approved R/S destinations available during errors. */ });
    }
    return () => { active = false; };
  }, [available]);
  return <>
    <Tabs action={backButton}>
        <a href="/board" aria-current={!queueId ? 'page' : undefined}>Both queues</a>
        {[...tabs].sort((a, b) => a.code.localeCompare(b.code)).map(tab => <a key={tab.code} href={`/board/${encodeURIComponent(tab.route)}`} aria-current={queueId && (selectedCode === tab.code || queueId === tab.route) ? 'page' : undefined}>Queue {tab.code}</a>)}
    </Tabs>
    <section className="public-display" aria-labelledby="public-display-title">
      <PageHeader id="public-display-title" className="public-display-title">Public queue display</PageHeader>
      {queueId ? <PublicQueueBoard key={queueId} queueId={queueId} onAvailable={available} onMissing={missing} /> : <div className="public-board-grid ui-grid">{approvedCodes.map(code => <PublicQueueBoard key={code} queueId={code} onAvailable={available} onMissing={missing} />)}</div>}
    </section>
  </>;
}
