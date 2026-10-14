import type { ReactNode } from 'react';

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pb-6">
      {crumbs}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="t-hero">{title}</h1>
          {sub && <div className="t-caption text-[15px]">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, children, actions, id, className }: { title: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; className?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className={className ?? 'flex flex-col gap-4'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id ? `${id}-h` : undefined} className="t-subhead">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
