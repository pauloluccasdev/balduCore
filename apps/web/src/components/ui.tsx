import type { ReactNode } from 'react';
export function Card({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function MetricCard({
  label,
  children,
  description,
}: {
  label: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="card metric">
      <h2>{label}</h2>
      <div className="metric-value">{children}</div>
      {description && <p>{description}</p>}
    </section>
  );
}
