'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { track } from '@/lib/analytics-client';

type State = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'locked'; until: number };

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

/**
 * One code field, uppercase, 6 characters. Also accepts a pasted share link.
 * Shared by the global code sheet and the locked roster panel.
 */
export function CodeEntryForm({ teamId, onDone, compact }: { teamId?: string; onDone?: () => void; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const countdown = useCountdown(state.kind === 'locked' ? state.until : null);
  const locked = state.kind === 'locked' && (countdown?.left ?? 1) > 0;

  useEffect(() => {
    if (state.kind === 'locked' && countdown?.left === 0) setState({ kind: 'idle' });
  }, [state, countdown?.left]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || locked) return;
    setBusy(true);
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value, teamId }),
      });
      const data = await res.json();
      track('code_attempted', { success: Boolean(data.ok), surface: teamId ? 'team_page' : 'global' });
      if (data.ok) {
        onDone?.();
        router.push(data.href);
        router.refresh();
        return;
      }
      if (data.reason === 'locked') {
        setState({ kind: 'locked', until: Date.now() + data.retryAfterSec * 1000 });
      } else {
        setState({ kind: 'error', message: data.message ?? "That code doesn't match. Check with the team." });
        setShake((s) => s + 1);
        inputRef.current?.focus();
      }
    } catch {
      setState({ kind: 'error', message: "We couldn't check the code. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const error = state.kind === 'error' ? state.message : locked ? `Too many tries. Try again in ${countdown?.label}.` : null;

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2" noValidate>
      <label htmlFor={id} className="t-label">
        Team code
      </label>
      <div className={cn('flex gap-3', compact ? 'flex-row' : 'flex-col sm:flex-row')}>
        <input
          key={shake}
          ref={inputRef}
          id={id}
          name="code"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="ABC123"
          value={value}
          disabled={locked}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            const v = e.target.value;
            setValue(/[/.:]/.test(v) ? v : v.toUpperCase().replace(/\s/g, ''));
            if (state.kind === 'error') setState({ kind: 'idle' });
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/^https?:\/\//i.test(text.trim())) {
              e.preventDefault();
              setValue(text.trim());
            }
          }}
          className={cn(
            'h-11 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 font-mono text-[18px] tracking-[0.2em] text-ink uppercase tabular placeholder:tracking-[0.2em] placeholder:text-ink-meta/60 disabled:bg-chrome aria-[invalid=true]:border-error',
            shake > 0 && state.kind === 'error' && 'gg-shake',
          )}
        />
        <Button type="submit" loading={busy} disabled={locked} loadingLabel="Checking">
          Unlock
        </Button>
      </div>
      <p id={`${id}-msg`} className={cn('text-[14px] leading-5', error ? 'text-error' : 't-caption')} role={error ? 'alert' : undefined}>
        {error ?? "Players and coaches share this code. It's usually 6 letters and numbers. You can also paste a team link."}
      </p>
    </form>
  );
}

/** Locked roster panel on the team page (ui-ux-spec 5.3). */
export function LockedRosterPanel({ teamId }: { teamId: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-chrome p-5 md:p-8">
      <div className="flex items-center gap-3">
        <Lock aria-hidden size={22} strokeWidth={1.75} className="text-ink-nav" />
        <h2 className="t-subhead">Enter the team code to see players</h2>
      </div>
      <div className="max-w-lg">
        <CodeEntryForm teamId={teamId} />
      </div>
    </div>
  );
}
