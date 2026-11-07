import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { AuthError, authRequest, home, isUnauthenticated, isPublicBoard, routeAccess } from './auth-api';
import { OperatorDesk } from './OperatorDesk';
import { CustomerQueues } from './CustomerQueues';
import { PublicQueueBoard, PublicQueueOverview } from './PublicQueueBoard';
import type { User } from './auth-api';
import { boardBackPath } from './board-navigation';

function navigate(path: string) { window.history.replaceState({}, '', path); }

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) errors.email = 'Enter a valid email address.';
    if (!password || password.length > 256) errors.password = 'Enter a password (up to 256 characters).';
    setFields(errors); setMessage('');
    if (Object.keys(errors).length) {
      document.getElementById(errors.email ? 'email' : 'password')?.focus();
      return;
    }
    submitting.current = true; setPending(true);
    try {
      const user = await authRequest('login', { email: email.trim(), password });
      setPassword('');
      if (user) onLogin(user);
    } catch (error) {
      setPassword('');
      if (error instanceof AuthError && error.status === 422) setFields(error.fields);
      else setMessage(isUnauthenticated(error) ? 'Invalid email or password.' : 'Unable to sign in. Please try again.');
    } finally { submitting.current = false; setPending(false); }
  }
  return <section className="card" aria-labelledby="login-title">
    <h2 id="login-title">Sign in</h2>
    <p>Use your restaurant account to continue.</p>
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email}
        onChange={event => setEmail(event.target.value)} disabled={pending} aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? 'email-error' : undefined} />
      {fields.email && <p className="error" id="email-error">{fields.email}</p>}
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password}
        onChange={event => setPassword(event.target.value)} disabled={pending} aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? 'password-error' : undefined} />
      {fields.password && <p className="error" id="password-error">{fields.password}</p>}
      <button type="button" className="secondary" disabled={pending} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide password' : 'Show password'}</button>
      {fields.form && <p role="alert">{fields.form}</p>}
      {message && <p role="alert">{message}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <span role="status">{pending ? 'Signing in. Please wait.' : ''}</span>
    </form>
  </section>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const logoutPending = useRef(false);
  const [path, setPath] = useState(window.location.pathname);
  function signedIn(value: User) {
    navigate(home(value)); setPath(home(value)); setUser(value);
  }
  function signedOut() {
    navigate('/login'); setPath('/login'); setUser(null); setLogoutError('');
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setRestoreError(false);
    void authRequest('me').then(value => {
      if (!active) return;
      if (value) {
        setUser(value);
        if (['/', '/login'].includes(window.location.pathname)) { navigate(home(value)); setPath(home(value)); }
      } else if (!isPublicBoard(window.location.pathname)) signedOut();
    }).catch(error => {
      if (!active) return;
      if (isUnauthenticated(error)) {
        setUser(null);
        if (!isPublicBoard(window.location.pathname)) signedOut();
      } else setRestoreError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true); setLogoutError('');
    try { await authRequest('logout', {}); signedOut(); }
    catch (error) {
      if (isUnauthenticated(error)) signedOut();
      else setLogoutError('Unable to log out. Please try again.');
    } finally { logoutPending.current = false; setLoggingOut(false); }
  }
  const publicBoard = isPublicBoard(path);
  const access = user ? routeAccess(user, path) : null;
  useEffect(() => {
    if (!loading && !restoreError && !user && !isPublicBoard(path) && path !== '/login') signedOut();
  }, [path, user, loading, restoreError]);
  function openBoard(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState({ publicBoardPrevious: window.location.pathname }, '', '/board');
    setPath('/board');
  }
  function backFromBoard() {
    const destination = boardBackPath(user);
    navigate(destination); setPath(destination);
  }
  return <main>
    {publicBoard && <button type="button" className="secondary board-back" onClick={backFromBoard} disabled={loading}>
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
      Back
    </button>}
    <h1>Restaurant Queue</h1>
    <p>Queue and service management</p>
    {!publicBoard && <nav aria-label="Public display"><a className="board-link" href="/board" onClick={openBoard}>View public board</a></nav>}
    {publicBoard ? (path.split('/')[2] ? <PublicQueueBoard key={path} queueId={path.split('/')[2]} /> : <PublicQueueOverview />) : loading ? <p role="status">Restoring your session…</p> : restoreError ? <section>
      <p role="alert">Unable to restore your session. Please try again.</p>
      <button onClick={() => setAttempt(value => value + 1)}>Retry</button>
    </section> : user ? <>
      <header className="account">
        <div><strong>{user.displayName}</strong><p>{user.role === 'CUSTOMER' ? 'Customer' : 'Operator'}</p></div>
        <button onClick={logout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button>
      </header>
      {logoutError && <p role="alert">{logoutError}</p>}
      {loggingOut && <p role="status">Logging out…</p>}
      {access === 'forbidden' ? <section><h2>Access denied</h2><p>You do not have permission to view this page.</p><a href={home(user)}>Back to your account</a></section> : access === 'missing' ? <section><h2>Page not found</h2><a href={home(user)}>Back to your account</a></section> : user.role === 'CUSTOMER' ? <CustomerQueues key={path} myQueue={path === '/my-queue'} onUnauthenticated={signedOut} /> : <OperatorDesk onUnauthenticated={signedOut} />}
    </> : <Login onLogin={signedIn} />}
  </main>;
}
