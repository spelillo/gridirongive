'use client';
import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { CodeEntryForm } from './CodeEntry';
import { cn } from '@/components/ui/cn';

export function CodeEntryLink({ label = 'Have a team code or link?', className }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('min-h-11 text-[16px] text-primary underline-offset-2 hover:text-primary-deep hover:underline', className)}>
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Enter a team code" initialFocusSelector="input[name=code]">
        <CodeEntryForm onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
