import { Divider, StatusBadge } from './components/ui';
export function QueueNumberDisplay({ number, status, publicDisplay = false, label }: { number: string | null; status: string | null; publicDisplay?: boolean; label?: string }) {
  return <section className={`queue-ticket ${publicDisplay ? 'public-call' : ''}`} aria-label={publicDisplay ? 'Public queue status' : 'Your queue entry'} aria-live="polite" aria-atomic="true">
    <p className={publicDisplay ? 'board-call-label' : undefined}>{label ?? (publicDisplay ? 'NOW CALLING' : 'Your queue number')}</p>
    <div key={`${number}:${status}`} className="queue-ticket-content"><strong className={publicDisplay ? 'public-called-number' : 'queue-number'}>{number ?? 'No one called'}</strong><Divider />
    {status && <StatusBadge status={status} className={publicDisplay ? 'board-status' : ''} />}
    </div>
  </section>;
}
