'use client';
import { useEffect } from 'react';
import { track } from '@/lib/analytics-client';

export function TrackView({ name, props }: { name: string; props?: Record<string, string | number | boolean | null> }) {
  useEffect(() => {
    track(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return null;
}
