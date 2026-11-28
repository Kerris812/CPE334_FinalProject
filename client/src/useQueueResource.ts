import { useCallback, useEffect, useRef, useState } from 'react';
/** Polling, visibility refresh and manual retry share one request gate. */
export function useQueueResource<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const refreshRef = useRef<(background?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true;
    let pending = false;
    let retryQueued = false;
    let hasSnapshot = false;
    let timer: number | undefined;
    async function refresh(background = false) {
      if (!active) return;
      if (pending) {
        if (!background) retryQueued = true;
        return;
      }
      pending = true;
      setRefreshing(true);
      if (!hasSnapshot) setLoading(true);
      try {
        const value = await load();
        if (active && !retryQueued) { hasSnapshot = true; setData(value); setError(null); }
      } catch (failure) {
        if (active && !retryQueued) setError(failure);
      } finally {
        pending = false;
        if (active && retryQueued) {
          retryQueued = false;
          void refresh();
        } else if (active) { setLoading(false); setRefreshing(false); }
      }
    }
    refreshRef.current = refresh;
    const stopTimer = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const startTimer = () => {
      stopTimer();
      if (poll && document.visibilityState === 'visible') {
        timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void refresh(true);
        }, 10000);
      }
    };
    const visibilityChanged = () => {
      stopTimer();
      if (document.visibilityState === 'visible') { void refresh(true); startTimer(); }
    };
    void refresh();
    startTimer();
    if (poll) document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      active = false;
      stopTimer();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [load, poll]);
  const retry = useCallback(() => { void refreshRef.current(); }, []);
  return { data, loading, refreshing, error, retry };
}
