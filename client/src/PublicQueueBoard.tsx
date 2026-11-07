import { useCallback, useId } from 'react';
import { QueueError, queueRequest } from './queue-api';
import type { PublicBoard } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { QueueNumberDisplay } from './QueueNumberDisplay';
export function PublicQueueBoard({ queueId, overview = false }: { queueId: string; overview?: boolean }) {
  const titleId = useId();
  const load = useCallback(() => queueRequest<PublicBoard>(`/public/queues/${encodeURIComponent(queueId)}/board`), [queueId]);
  const resource = useQueueResource(load, true);
  return <section className="public-board" aria-labelledby={titleId}>{overview ? <h3 id={titleId}>Queue {queueId}</h3> : <><h2 id={titleId}>Public queue display</h2><BoardLinks /></>}
    <button className="secondary" onClick={resource.retry} disabled={resource.refreshing}>Refresh board</button>
    {resource.loading ? <p role="status">Loading public queue status…</p> : resource.error ? <>
      <p role="alert">{resource.error instanceof QueueError && resource.error.status === 404 ? 'Queue not found.' : 'Unable to load the public board. Please try again.'}</p>
      {!(resource.error instanceof QueueError && resource.error.status === 404) && <button onClick={resource.retry}>Retry</button>}
    </> : resource.data && <>
      {!overview && <h3>Queue {resource.data.queueCode}</h3>}<QueueNumberDisplay number={resource.data.calledNumber} status={resource.data.serviceState} publicDisplay />
      <p>Waiting guests</p><output className="waiting-count" aria-label="Waiting guests" aria-live="polite">{resource.data.waitingCount}</output>
    </>}
  </section>;
}

function BoardLinks() { return <nav aria-label="Queue displays"><a href="/board">Both queues</a>{' · '}<a href="/board/R">Queue R display</a>{' · '}<a href="/board/S">Queue S display</a></nav>; }
export function PublicQueueOverview() {
  return <section className="public-board public-overview"><h2>Public queue display</h2><BoardLinks /><div className="public-board-grid"><PublicQueueBoard queueId="R" overview /><PublicQueueBoard queueId="S" overview /></div></section>;
}
