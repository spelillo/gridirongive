'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

/**
 * Bottom sheet below 768px, modal above (ui-ux-spec 3). Built on <dialog> so
 * focus is trapped and Esc works natively. Swipe down on the handle closes it
 * on touch screens. While `locked` (a payment is processing) it can't be
 * dismissed.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  locked,
  size = 'md',
  initialFocusSelector,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  locked?: boolean;
  size?: 'md' | 'lg' | 'xl';
  initialFocusSelector?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const target = initialFocusSelector ? d.querySelector<HTMLElement>(initialFocusSelector) : null;
        target?.focus();
      });
    }
    if (!open && d.open) d.close();
    return () => {
      if (!open) document.documentElement.style.overflow = '';
    };
  }, [open, initialFocusSelector]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (!lockedRef.current) onClose();
    };
    const onCloseEvt = () => {
      document.documentElement.style.overflow = '';
    };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onCloseEvt);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('close', onCloseEvt);
    };
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked) return;
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    panel.current.style.transform = '';
    if (dy > 90) onClose();
  };

  const width = size === 'xl' ? 'md:max-w-[960px]' : size === 'lg' ? 'md:max-w-[720px]' : 'md:max-w-[560px]';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current && !locked) onClose();
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-auto m-0 w-full bg-transparent p-0 md:inset-0 md:m-auto md:h-fit',
        width,
        'backdrop:bg-black/50 open:animate-[gg-sheet-in_200ms_var(--ease-out)]',
      )}
    >
      <div
        ref={panel}
        className="flex max-h-[90dvh] flex-col rounded-t-lg bg-canvas shadow-float transition-transform duration-150 md:rounded-lg"
      >
        <div
          className="flex touch-none justify-center pt-2 md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        >
          <span className="h-1 w-10 rounded-[2px] bg-hairline-soft" />
        </div>
        <header className="flex items-start justify-between gap-4 border-b border-hairline-soft px-6 pb-4 pt-3 md:pt-6">
          <h2 id={titleId} className="t-subhead pt-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-chrome disabled:opacity-40"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {footer && <div className="border-t border-hairline-soft px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </dialog>
  );
}
