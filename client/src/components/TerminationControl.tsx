import { useEffect, useId, useRef, useState } from 'react';
import { HttpError, requestData } from '../api-client';
import { Button, FormField } from './ui';

type Action = 'customer-cancel' | 'operator-cancel' | 'no-show';

export function TerminationControl({ action, entry, disabled, onUnauthenticated, onRefresh, onSuccess, onFailure }: {
  action: Action;
  entry: { id: string; displayNumber: string; counterName?: string };
  disabled?: boolean;
  onUnauthenticated: () => void;
  onRefresh: () => void;
  onSuccess: (message: string) => void;
  onFailure: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  const noShow = action === 'no-show';
  const operatorReason = action === 'operator-cancel';
  const reasonMessage = 'Enter a single-line reason of 1–200 characters with no control characters.';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || disabled) return;
    const trimmed = reason.trim();
    if (operatorReason && (!trimmed || [...trimmed].length > 200 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(reason))) {
      setError(reasonMessage);
      return;
    }
    sending.current = true;
    setPending(true);
    setError('');
    try {
      const role = action === 'customer-cancel' ? 'customer' : 'operator';
      await requestData(`/${role}/entries/${entry.id}/${noShow ? 'no-show' : 'cancel'}`, operatorReason ? { reason: trimmed } : {});
      dialog.current?.close();
      onSuccess(noShow ? `${entry.displayNumber} marked no-show.` : `${entry.displayNumber} cancelled.`);
    } catch (failure) {
      if (failure instanceof HttpError && failure.status === 422 && operatorReason) {
        setError(failure.fields.reason ?? failure.fields.form ?? reasonMessage);
        return;
      }
      dialog.current?.close();
      if (failure instanceof HttpError && failure.status === 401) onUnauthenticated();
      else {
        const early = failure instanceof HttpError && failure.code === 'NO_SHOW_TOO_EARLY';
        const eligibleAt = early && failure.eligibleAt ? new Date(failure.eligibleAt).toLocaleTimeString() : null;
        onFailure(early ? (eligibleAt ? `No-show is available at ${eligibleAt}.` : 'No-show is not yet available.') :
          failure instanceof HttpError && failure.status === 403 ? 'You no longer have permission for this action.' :
          failure instanceof HttpError && failure.status === 409 ? 'The entry changed. Check its refreshed status.' :
          'Unable to confirm the update. Check refreshed status before trying again.');
      }
    } finally {
      if (!dialog.current?.open) onRefresh();
      sending.current = false;
      setPending(false);
    }
  }

  return <>
    <Button variant="secondary" disabled={disabled || pending} onClick={() => {
      setReason('');
      setError('');
      dialog.current?.showModal();
    }}>{noShow ? 'Mark no-show' : operatorReason ? 'Cancel waiting entry' : 'Cancel queue entry'}</Button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { if (sending.current) event.preventDefault(); }}>
      <form onSubmit={submit} aria-busy={pending}>
        <h3 id={`${id}-title`}>{noShow ? 'Mark' : 'Cancel'} {entry.displayNumber}{noShow ? ' as no-show' : ''}?</h3>
        <p>{noShow ? (entry.counterName ? `This releases ${entry.counterName}.` : 'This releases the current service slot.') : operatorReason ? 'This removes the entry from the waiting queue.' : 'You will lose your current position in the queue.'}</p>
        {operatorReason && <FormField id={`${id}-reason`} label="Cancellation reason" error={error} errorId={`${id}-error`}>
          <input id={`${id}-reason`} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
        </FormField>}
        <Button variant="secondary" disabled={pending} onClick={() => dialog.current?.close()} type="button">Back</Button>
        <Button type="submit" disabled={disabled || pending} pending={pending}>{noShow ? 'Confirm no-show' : 'Confirm cancellation'}</Button>
      </form>
    </dialog>
  </>;
}

export function NoShowControl({ entry, serverTime, ...props }: Omit<React.ComponentProps<typeof TerminationControl>, 'action'> & {
  entry: { id: string; displayNumber: string; calledAt?: string | null };
  serverTime: () => number;
}) {
  const [clock, setClock] = useState(serverTime);
  useEffect(() => {
    const tick = () => setClock(serverTime());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverTime]);
  const eligibleAt = entry.calledAt ? Date.parse(entry.calledAt) + 300_000 : NaN;
  return <>
    {Number.isFinite(eligibleAt) && <p>No-show available from <time dateTime={new Date(eligibleAt).toISOString()}>{new Date(eligibleAt).toLocaleTimeString()}</time>.</p>}
    <TerminationControl {...props} entry={entry} action="no-show" disabled={props.disabled || !(clock >= eligibleAt)} />
  </>;
}
