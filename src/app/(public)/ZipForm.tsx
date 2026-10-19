'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** ZIP chosen once and stored on this device. No browser location prompt. */
export function ZipForm({ current, compact, inline }: { current?: string; compact?: boolean; inline?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!compact);
  const [zip, setZip] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <button type="button" className="min-h-11 rounded-full border border-[#cfd6e1] bg-canvas px-4 text-[14px] font-semibold text-ink hover:bg-chrome" onClick={() => setEditing(true)}>
        {current ? `ZIP ${current}` : 'Set location'} · Change
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{5}$/.test(zip)) {
          setError('Enter a 5-digit ZIP code.');
          return;
        }
        document.cookie = `gg_zip=${zip}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        setError(null);
        if (compact) setEditing(false);
        router.refresh();
      }}
    >
      <label htmlFor="zip" className={inline ? 'sr-only' : 't-label'}>
        ZIP code
      </label>
      <div className="flex gap-3">
        <input
          id="zip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'zip-error' : undefined}
          placeholder={inline ? 'ZIP code' : undefined}
          className="h-11 w-32 rounded-[10px] border border-hairline bg-canvas px-3 text-[16px] tabular placeholder:text-ink-meta focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none aria-[invalid=true]:border-error"
        />
        <button type="submit" className="h-11 rounded-[10px] bg-ink px-4 text-[15px] font-semibold text-white hover:bg-navy">
          Show teams
        </button>
      </div>
      {error && (
        <p id="zip-error" role="alert" className="text-[14px] text-error">
          {error}
        </p>
      )}
    </form>
  );
}
