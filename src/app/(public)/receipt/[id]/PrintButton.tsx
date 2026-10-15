'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer size={18} aria-hidden /> Print or save as PDF
    </Button>
  );
}
