'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GiveForm } from '@/components/give/GiveForm';
import type { GiveConfig, GiveTarget } from '@/components/give/types';

export function StandaloneGive({ config, target: initial, backHref }: { config: GiveConfig; target: GiveTarget; backHref: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(initial);
  const [key, setKey] = useState(0);
  return (
    <GiveForm
      key={key}
      config={config}
      target={target}
      standalone
      onClose={() => router.push(backHref)}
      onRetarget={(t) => {
        setTarget(t);
        setKey((k) => k + 1);
      }}
    />
  );
}
