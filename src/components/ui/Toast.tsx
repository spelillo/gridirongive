'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<(message: string, action?: ToastItem['action']) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

/** Bottom center on mobile, bottom left on desktop, 4s, one optional action (ui-ux-spec 3). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((message: string, action?: ToastItem['action']) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, message, action }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex flex-col items-center gap-2 p-4 pb-[max(16px,env(safe-area-inset-bottom))] md:items-start">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={cn('pointer-events-auto flex max-w-md items-center gap-4 rounded-md bg-ink px-4 py-3 text-[15px] text-white shadow-pop animate-[gg-fade-in_150ms_ease-out]')}>
      <span>{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="min-h-9 shrink-0 rounded-md px-2 font-medium text-[#9ccaff] hover:underline"
          onClick={() => {
            item.action!.onClick();
            onDone();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
