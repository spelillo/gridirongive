'use client';
import { useEffect, useRef, useState } from 'react';
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
