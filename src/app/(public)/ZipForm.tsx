'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** ZIP chosen once and stored on this device. No browser location prompt. */
export function ZipForm({ current, compact }: { current?: string; compact?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!compact);
  const [zip, setZip] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <button type="button" className="min-h-11 text-[15px] text-primary hover:underline" onClick={() => setEditing(true)}>
        Change location
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
      <label htmlFor="zip" className="t-label">
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
          className="h-11 w-32 rounded-md border border-hairline px-3 text-[16px] tabular aria-[invalid=true]:border-error"
        />
        <button type="submit" className="h-11 rounded-md border border-hairline px-4 font-medium text-primary-deep hover:bg-band-blue">
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
