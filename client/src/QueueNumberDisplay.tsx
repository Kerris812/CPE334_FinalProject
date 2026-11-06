export function QueueNumberDisplay({ number, status, publicDisplay = false }: { number: string | null; status: string | null; publicDisplay?: boolean }) {
  return <section className="queue-ticket" aria-label={publicDisplay ? 'Public queue status' : 'Your queue entry'} aria-live="polite">
    <p>{publicDisplay ? 'Currently called number' : 'Your queue number'}</p>
    <strong className="queue-number">{number ?? 'No one called'}</strong>
    {status && <p className={`queue-status status-${status.toLowerCase()}`}>{status}</p>}
  </section>;
}
