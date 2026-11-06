import { useEffect, useState } from 'react';
/** One request at a time; ignore late results after navigation or logout. */
export function useQueueResource<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; let pending = false;
    async function refresh(background = false) {
      if (pending) return;
      pending = true;
      if (!background) setLoading(true);
      try { const value = await load(); if (active) { setData(value); setError(null); } }
      catch (failure) { if (active) setError(failure); }
      finally { pending = false; if (active) setLoading(false); }
    }
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const timer = poll ? window.setInterval(visibleRefresh, 10000) : undefined;
    if (poll) document.addEventListener('visibilitychange', visibleRefresh);
    return () => { active = false; if (timer !== undefined) window.clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [load, poll, attempt]);
  return { data, loading, error, retry: () => setAttempt(value => value + 1) };
}
