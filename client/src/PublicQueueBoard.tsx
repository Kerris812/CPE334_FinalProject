import { useCallback } from 'react';
import { QueueError, queueRequest } from './queue-api';
import type { PublicBoard } from './queue-api';
import { useQueueResource } from './useQueueResource';
import { QueueNumberDisplay } from './QueueNumberDisplay';
export function PublicQueueBoard({ queueId }: { queueId: string }) {
  const load = useCallback(() => queueRequest<PublicBoard>(`/public/queues/${encodeURIComponent(queueId)}/board`), [queueId]);
  const resource = useQueueResource(load, true);
  return <section className="public-board" aria-labelledby="board-title"><h2 id="board-title">Public queue display</h2>
    {resource.loading ? <p role="status">Loading public queue status…</p> : resource.error ? <>
      <p role="alert">{resource.error instanceof QueueError && resource.error.status === 404 ? 'Queue not found.' : 'Unable to load the public board. Please try again.'}</p>
      {!(resource.error instanceof QueueError && resource.error.status === 404) && <button onClick={resource.retry}>Retry</button>}
    </> : resource.data && <>
      <h3>Queue {resource.data.queueCode}</h3><QueueNumberDisplay number={resource.data.calledNumber} status={resource.data.serviceState} publicDisplay />
      <p>Waiting guests</p><output className="waiting-count" aria-label="Waiting guests" aria-live="polite">{resource.data.waitingCount}</output>
    </>}
  </section>;
}
