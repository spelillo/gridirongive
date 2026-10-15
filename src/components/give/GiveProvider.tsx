'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { teamVars } from '@/config/team-colors';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { track } from '@/lib/analytics-client';
import { GiveForm } from './GiveForm';
import type { GiveConfig, GiveTarget } from './types';

const Ctx = createContext<{ open: (t: GiveTarget) => void; isOpen: boolean; config: GiveConfig } | null>(null);

export function useGive() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGive outside GiveProvider');
  return c;
}

/** Holds the give sheet for a page. Server data flows in as `config` and refreshes live. */
export function GiveProvider({ config, children }: { config: GiveConfig; children: ReactNode }) {
  const [target, setTarget] = useState<GiveTarget | null>(null);
  const [locked, setLocked] = useState(false);
  const [instance, setInstance] = useState(0);
  const open = useCallback((t: GiveTarget) => {
    track('give_opened', { entry: t.kind === 'need' ? t.entry : t.kind });
    setTarget(t);
    setInstance((i) => i + 1);
  }, []);
  const close = useCallback(() => {
    if (!locked) setTarget(null);
  }, [locked]);
  const title =
    target?.kind === 'fund_rest' ? `Fund the rest of ${target.athleteName}'s list`
    : target?.kind === 'athlete' ? `Give to ${target.athleteName}`
    : target?.kind === 'team_fund' ? 'Give to the team fund'
    : 'Give to this item';
  return (
    <Ctx.Provider value={{ open, isOpen: Boolean(target), config }}>
      {children}
      <div className="contents" style={teamVars(config.team.color) as React.CSSProperties}>
        <Sheet open={Boolean(target)} onClose={close} title={title} locked={locked} size="lg" initialFocusSelector="[data-autofocus], [role=radio][aria-checked=true], input">
          {target && (
            <GiveForm key={instance} config={config} target={target} onClose={close} onLockChange={setLocked} onRetarget={(t) => setTarget(t)} />
          )}
        </Sheet>
      </div>
    </Ctx.Provider>
  );
}

export function GiveButton({ target, children, variant = 'secondary', className, full, size, disabled }: { target: GiveTarget; children: ReactNode; variant?: ButtonVariant; className?: string; full?: boolean; size?: 'md' | 'sm'; disabled?: boolean }) {
  const { open, config } = useGive();
  return (
    <Button variant={variant} className={className} full={full} size={size} disabled={disabled || !config.team.acceptsGifts} onClick={() => open(target)}>
      {children}
    </Button>
  );
}
