import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Plain reading layout for help, policy and explainer pages: one column,
 * 16px body text, real headings in order, and an optional "On this page" list.
 */
export function DocPage({ title, intro, meta, toc, children, aside, width = 'md' }: { title: string; intro?: ReactNode; meta?: ReactNode; toc?: { id: string; label: string }[]; children: ReactNode; aside?: ReactNode; width?: 'md' | 'lg' }) {
  return (
    <div className="page-x mx-auto w-full max-w-[1200px] py-8 md:py-12">
      <div className={cn('grid gap-8', toc && 'lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16')}>
        <article className={cn('flex min-w-0 flex-col gap-8', width === 'md' ? 'max-w-[760px]' : 'max-w-[880px]')}>
          <header className="flex flex-col gap-3">
            <h1 className="t-hero">{title}</h1>
            {intro && <div className="t-body [&_a]:underline">{intro}</div>}
            {meta && <p className="t-caption [&_a]:underline">{meta}</p>}
            {aside}
          </header>
          {toc && (
            <nav aria-label="On this page" className="rounded-md bg-chrome p-4 lg:hidden">
              <TocList toc={toc} />
            </nav>
          )}
          {children}
        </article>
        {toc && (
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-[84px]">
              <TocList toc={toc} />
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

function TocList({ toc }: { toc: { id: string; label: string }[] }) {
  return (
    <>
      <p className="t-label mb-2">On this page</p>
      <ul className="flex flex-col">
        {toc.map((t) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className="inline-flex min-h-9 items-center text-[15px] leading-5 no-underline hover:underline">
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const prose =
  'flex flex-col gap-3 [&_a]:underline text-[16px] leading-6 text-ink-body [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-6 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-6 [&_h3]:mt-2 [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:text-ink [&_strong]:font-medium [&_strong]:text-ink';

export function DocSection({ id, title, children, className }: { id: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn('scroll-mt-[84px] border-t border-hairline-soft pt-6', className)}>
      <h2 id={`${id}-h`} className="t-subhead mb-3">
        {title}
      </h2>
      <div className={prose}>{children}</div>
    </section>
  );
}
