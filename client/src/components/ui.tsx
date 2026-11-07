import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', pending = false, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; pending?: boolean }) {
  return <button {...props} className={`ui-button ui-button--${variant} ${className}`} aria-busy={pending || undefined}>{pending && <span className="ui-spinner" aria-hidden="true" />}<span className="ui-button-label">{children}</span></button>;
}
export function BackLink({ children, className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return <span {...props} className={`ui-back-label ${className}`}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 5-7 7 7 7M5 12h14" /></svg>{children}</span>;
}
export function AppShell({ children, header, variant, className = '' }: { children: ReactNode; header: ReactNode; variant: 'login' | 'customer' | 'customer-status' | 'public' | 'operator' | 'default'; className?: string }) {
  return <div className={`app-shell app-shell--${variant === 'customer-status' ? 'customer' : variant} ${variant === 'customer-status' ? 'app-shell--customer-status' : ''}`}>{header}<main className={`app-content ${className}`}>{children}</main></div>;
}
export function PageHeader({ children, action, as: Tag = 'h2', id, className = '' }: { children: ReactNode; action?: ReactNode; as?: 'h1' | 'h2'; id?: string; className?: string }) {
  return <div className={`ui-page-header ${className}`}><Tag id={id} className={className}>{children}</Tag>{action}</div>;
}
export function Card({ title, badge, titleId, titleAs: Tag = 'h2', children, footer, className = '', headerClassName = '', badgeClassName = '', ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode; badge?: ReactNode; titleId?: string; titleAs?: 'h1' | 'h2' | 'h3'; footer?: ReactNode; headerClassName?: string; badgeClassName?: string }) {
  return <section {...props} className={`ui-card ${className}`}>{title && <header className={`ui-card-header ${headerClassName}`}>{badge && <span className={`ui-card-badge ${badgeClassName}`} aria-hidden="true">{badge}</span>}<Tag className="ui-card-title" id={titleId}>{title}</Tag></header>}<div className="ui-card-body">{children}</div>{footer && <div className="ui-card-footer">{footer}</div>}</section>;
}
export function Divider() { return <div className="ui-divider" aria-hidden="true"><span>✦</span></div>; }
export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return <p className={`ui-status queue-status status-${status.toLowerCase()} ${className}`}><span className="status-marker" aria-hidden="true" />{status}</p>;
}
export function StatBlock({ value, label, live = false, strong = false }: { value: number; label: string; live?: boolean; strong?: boolean }) {
  return <div className={`ui-stat ${strong ? '' : 'public-waiting'}`}>{strong ? <strong className="waiting-count">{value}</strong> : <output className="waiting-count" aria-label="Waiting guests" aria-live={live ? 'polite' : undefined}>{value}</output>}<span>{label}</span></div>;
}
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="queue-details ui-details">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
export function FooterMeta({ updatedAt, action, className = '' }: { updatedAt?: Date; action?: ReactNode; className?: string }) {
  return <footer className={`ui-footer-meta ${className}`}><small><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>{updatedAt ? <>Updated <time dateTime={updatedAt.toISOString()}>{updatedAt.toLocaleTimeString('en-GB', { hour12: false })}</time></> : 'Not updated yet'} · refreshes every 10 s</small>{action}</footer>;
}
export function EmptyState({ title, helper, action, className = '' }: { title: ReactNode; helper?: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={`ui-state ${className}`}><svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14v12H5zM8 4v7m8-7v7M5 13h14"/></svg><h3>{title}</h3>{helper && <p>{helper}</p>}{action}</div>;
}
export function ErrorState({ title, helper, onRetry, pending = false, className = '' }: { title: ReactNode; helper?: ReactNode; onRetry: () => void; pending?: boolean; className?: string }) {
  return <div className={`ui-state ui-error ${className}`} role="alert"><svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/></svg><h3>{title}</h3>{helper && <p>{helper}</p>}<Button variant="secondary" disabled={pending} pending={pending} onClick={onRetry}>Retry</Button></div>;
}
export function InlineNotice({ children, id, className = '', alert = true }: { children: ReactNode; id?: string; className?: string; alert?: boolean }) { return <p id={id} className={`ui-notice ${className}`} role={alert ? 'alert' : undefined}><span aria-hidden="true">!</span>{children}</p>; }
export function FormField({ id, label, error, errorId = `${id}-error`, alwaysError = false, children }: { id: string; label: ReactNode; error?: string; errorId?: string; alwaysError?: boolean; children: ReactNode }) {
  return <><label htmlFor={id}>{label}</label>{children}{error ? <InlineNotice id={errorId} className="error ui-field-error">{error}</InlineNotice> : alwaysError ? <p id={errorId} className="error ui-field-error" /> : null}</>;
}
export function Tabs({ children, action }: { children: ReactNode; action?: ReactNode }) { return <nav className="board-navigation ui-tabs" aria-label="Queue displays"><div className="board-navigation-links">{children}</div>{action}</nav>; }
