'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function PrintNow({ label = 'Print' }: { label?: string }) {
  return (
    <div className="no-print flex justify-end">
      <Button onClick={() => window.print()}>
        <Printer size={18} aria-hidden /> {label}
      </Button>
    </div>
  );
}
