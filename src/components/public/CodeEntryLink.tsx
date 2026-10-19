'use client';
import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { CodeEntryForm } from './CodeEntry';
import { cn } from '@/components/ui/cn';

/** `bare` drops the default link styling so `className` styles the button alone. */
export function CodeEntryLink({ label = 'Have a team code or link?', className, bare }: { label?: string; className?: string; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={bare ? className : cn('min-h-11 text-[16px] text-primary underline-offset-2 hover:text-primary-deep hover:underline', className)}>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Enter a team code" initialFocusSelector="input[name=code]">
        <CodeEntryForm onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
