'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/components/ui/cn';

/** Text clamped to N lines with "Read more" (only shown when it actually overflows). */
export function ClampText({ text, lines = 4, className }: { text: string; lines?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div className={className}>
      <p ref={ref} className="t-body whitespace-pre-line" style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn('mt-1 min-h-9 text-[15px] text-primary hover:underline')}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/**
 * One accordion row (FAQ). Built on <details> so it works without
 * JavaScript, is keyboard operable and announces its state natively.
 */
export function Disclosure({ summary, children, id, className }: { summary: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <details id={id} className={cn('group border-b border-hairline-soft', className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] leading-6 font-medium text-ink hover:text-primary-deep [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <ChevronDown aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-nav transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 pb-4 text-[16px] leading-6 text-ink-body [&_a]:underline">{children}</div>
    </details>
  );
}
