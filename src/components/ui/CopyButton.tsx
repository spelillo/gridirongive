'use client';
import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { buttonClass, type ButtonVariant } from './Button';
import { useToast } from './Toast';
import { cn } from './cn';
import { track } from '@/lib/analytics-client';

export function CopyButton({ value, label = 'Copy', copiedLabel = 'Copied', variant = 'secondary', className, surface }: { value: string; label?: string; copiedLabel?: string; variant?: ButtonVariant; className?: string; surface?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={cn(buttonClass(variant), className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast('Copied to clipboard');
          if (surface) track('share_clicked', { surface, method: 'copy' });
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast("Couldn't copy. Select the text and copy it instead.");
        }
      }}
    >
      {done ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden strokeWidth={1.75} />}
      {done ? copiedLabel : label}
    </button>
  );
}

/** System share sheet where available (mobile), copy link otherwise. */
export function ShareButton({ url, title, text, label = 'Share', variant = 'primary', className, surface }: { url: string; title: string; text?: string; label?: string; variant?: ButtonVariant; className?: string; surface: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={cn(buttonClass(variant), className)}
      onClick={async () => {
        track('share_clicked', { surface });
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ url, title, text });
            return;
          } catch (err) {
            if ((err as Error).name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied');
        } catch {
          toast("Couldn't copy the link.");
        }
      }}
    >
      <Share2 size={18} aria-hidden strokeWidth={1.75} />
      {label}
    </button>
  );
}
