import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { AuthError, authRequest, home, isUnauthenticated, isPublicBoard, routeAccess } from './auth-api';
import { OperatorDesk } from './OperatorDesk';
import { AppHeader } from './AppHeader';
import { CustomerQueues } from './CustomerQueues';
import { PublicQueueDisplay } from './PublicQueueBoard';
import type { User } from './auth-api';
import { boardBackPath } from './board-navigation';
import { AppShell, BackLink, Button, Card, ErrorState, FormField, InlineNotice } from './components/ui';

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
  return <Card className="card login-card" aria-labelledby="login-title" title="Sign in" titleId="login-title" badge="R">
    <p className="ui-card-description">Use your restaurant account to continue.</p>
    <form onSubmit={submit} noValidate aria-busy={pending}>
      <FormField id="email" label="Email" error={fields.email}>
      <input id="email" name="email" type="email" placeholder="customer@example.com" autoComplete="username" required maxLength={254} value={email}
        onChange={event => setEmail(event.target.value)} disabled={pending} aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? 'email-error' : undefined} />
      </FormField>
      <FormField id="password" label="Password" error={fields.password}>
      <input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required maxLength={256} value={password}
        onChange={event => setPassword(event.target.value)} disabled={pending} aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? 'password-error' : undefined} />
      </FormField>
      <Button variant="secondary" type="button" className="secondary password-toggle" disabled={pending} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide password' : 'Show password'}</Button>
      {fields.form && <InlineNotice>{fields.form}</InlineNotice>}
      {message && <InlineNotice>{message}</InlineNotice>}
      <Button type="submit" disabled={pending} pending={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      <span role="status">{pending ? 'Signing in. Please wait.' : ''}</span>
    </form>
  </Card>;
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
  const signInScreen = !publicBoard && !user && !loading && !restoreError;
  const customerStatusPage = !publicBoard && user?.role === 'CUSTOMER' && path === '/my-queue';
  const boardNavigation = <nav aria-label="Public display"><a className="board-link" href="/board" onClick={openBoard}>View public board</a></nav>;
  const backButton = <Button variant="ghost" type="button" className="secondary board-back" onClick={backFromBoard} disabled={loading}>
      <BackLink>Back</BackLink>
    </Button>;
  const variant = publicBoard ? 'public' : customerStatusPage ? 'customer-status' : user?.role === 'CUSTOMER' ? 'customer' : user?.role === 'OPERATOR' ? 'operator' : signInScreen ? 'login' : 'default';
  return <AppShell variant={variant} className={publicBoard ? 'public-display-page' : customerStatusPage ? 'customer-status-page' : signInScreen ? 'auth-shell' : undefined} header={<AppHeader user={user} publicPage={publicBoard} statusPage={customerStatusPage} loggingOut={loggingOut} onLogout={logout} />}>
    {!publicBoard && boardNavigation}
    {publicBoard ? <PublicQueueDisplay key={path} queueId={path.split('/')[2] || undefined} backButton={backButton} /> : loading ? <Card><p role="status">Restoring your session…</p></Card> : restoreError ? <ErrorState title="Unable to restore your session. Please try again." onRetry={() => setAttempt(value => value + 1)} /> : user ? <>
      {logoutError && <InlineNotice>{logoutError}</InlineNotice>}
      {loggingOut && <p role="status">Logging out…</p>}
      {access === 'forbidden' ? <Card title="Access denied"><p>You do not have permission to view this page.</p><a className="ui-ghost-link" href={home(user)}>Back to your account</a></Card> : access === 'missing' ? <Card title="Page not found"><a className="ui-ghost-link" href={home(user)}>Back to your account</a></Card> : user.role === 'CUSTOMER' ? <CustomerQueues key={path} myQueue={path === '/my-queue'} onUnauthenticated={signedOut} /> : <OperatorDesk onUnauthenticated={signedOut} />}
    </> : <Login onLogin={signedIn} />}
  </AppShell>;
}
