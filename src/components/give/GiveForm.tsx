'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Checkbox } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';
import { money, moneyWhole, quoteGift, parseDollarsToCents } from '@/lib/domain/money';
import { track } from '@/lib/analytics-client';
import { GearArt } from '@/components/gear/GearArt';
import { SimulatedPay, type PayHandle } from './SimulatedPay';
import { needLeft, type GiveConfig, type GiveNeed, type GiveTarget } from './types';

const StripePay = dynamic(() => import('./StripePay').then((m) => m.StripePay), {
  ssr: false,
  loading: () => <div className="gg-skeleton h-40 w-full" aria-label="Loading payment form" />,
});

type AmountChoice = { kind: 'rest' } | { kind: 'fixed'; cents: number } | { kind: 'other' };

function randomKey() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The give sheet body (ui-ux-spec 5.5). One scrolling form in four blocks:
 * what you're funding, amount, your details, total and pay.
 */
export function GiveForm({
  config,
  target,
  onClose,
  onLockChange,
  onRetarget,
  standalone,
}: {
  config: GiveConfig;
  target: GiveTarget;
  onClose?: () => void;
  onLockChange?: (locked: boolean) => void;
  onRetarget?: (t: GiveTarget) => void;
  standalone?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const sessionKey = useRef(randomKey());
  const payRef = useRef<PayHandle | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLFieldSetElement>(null);
  const needs = config.needs;
  const byId = useMemo(() => new Map(needs.map((n) => [n.id, n])), [needs]);

  // What's being funded --------------------------------------------------------
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const restNeeds = useMemo(
    () => (target.kind === 'fund_rest' ? needs.filter((n) => n.athleteId === target.athleteId && needLeft(n) > 0 && !removed.has(n.id)) : []),
    [needs, target, removed],
  );
  const need = target.kind === 'need' ? byId.get(target.needId) ?? null : null;
  const athleteName =
    target.kind === 'fund_rest' || target.kind === 'athlete' ? target.athleteName : need?.athleteName ?? null;
  const recipientFirst = athleteName ? athleteName.split(' ')[0] : config.team.name;

  const maxCents =
    target.kind === 'need' ? (need ? needLeft(need) : 0)
    : target.kind === 'fund_rest' ? restNeeds.reduce((s, n) => s + needLeft(n), 0)
    : target.kind === 'athlete' ? needs.filter((n) => n.athleteId === target.athleteId).reduce((s, n) => s + needLeft(n), 0)
    : Number.POSITIVE_INFINITY;

  // Amount -------------------------------------------------------------------------
  const defaultChoice: AmountChoice =
    target.kind === 'need' ? { kind: 'rest' } : target.kind === 'fund_rest' ? { kind: 'rest' } : { kind: 'fixed', cents: Math.min(5000, Number.isFinite(maxCents) ? maxCents : 5000) };
  const [choice, setChoice] = useState<AmountChoice>(defaultChoice);
  const [other, setOther] = useState('');
  const [sendExtra, setSendExtra] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastMax, setLastMax] = useState(maxCents);

  const rawAmount =
    choice.kind === 'rest' ? (Number.isFinite(maxCents) ? maxCents : 0)
    : choice.kind === 'fixed' ? choice.cents
    : parseDollarsToCents(other) ?? 0;
  const overMax = Number.isFinite(maxCents) && rawAmount > maxCents;
  const amount = overMax && !sendExtra ? maxCents : rawAmount;

  // Live updates: clamp when someone else funds part of this while the sheet is open.
  if (maxCents !== lastMax) {
    if (maxCents < lastMax && Number.isFinite(lastMax)) {
      setNotice(maxCents <= 0 ? (target.kind === 'need' ? 'This item was just fully funded.' : 'Everything here was just funded.') : 'Someone just funded part of this. We updated the amount.');
    }
    setLastMax(maxCents);
  }

  const chips = useMemo(() => {
    const out: { id: string; label: string; choice: AmountChoice }[] = [];
    if (target.kind === 'need' && Number.isFinite(maxCents) && maxCents > 0) out.push({ id: 'rest', label: `Rest of item (${moneyWhole(maxCents)})`, choice: { kind: 'rest' } });
    for (const c of [2500, 5000, 10000]) {
      if (c <= maxCents && !(target.kind === 'need' && c === maxCents)) out.push({ id: String(c), label: moneyWhole(c), choice: { kind: 'fixed', cents: c } });
    }
    out.push({ id: 'other', label: 'Other', choice: { kind: 'other' } });
    return out;
  }, [maxCents, target.kind]);
  const activeChip = choice.kind === 'rest' ? 'rest' : choice.kind === 'fixed' ? String(choice.cents) : 'other';

  // Details ----------------------------------------------------------------------
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [showName, setShowName] = useState(true);
  const [message, setMessage] = useState('');
  const [cover, setCover] = useState(true);
  const [feesHelp, setFeesHelp] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const quote = amount > 0 ? quoteGift(amount, cover, config.fees) : null;

  const errors: Record<string, string> = {};
  if (amount < config.minGiftCents) errors.amount = amount <= 0 ? 'Choose an amount.' : `The smallest gift is ${moneyWhole(config.minGiftCents)}.`;
  if (!EMAIL.test(email.trim())) errors.email = email.trim() ? 'Enter a valid email address, like name@example.com.' : 'Enter your email so we can send a receipt.';
  if (!name.trim()) errors.name = 'Enter your name. You can still give anonymously below.';
  const show = (f: string) => (submitted || touched[f]) && errors[f];

  // Submit -------------------------------------------------------------------------
  const [phase, setPhase] = useState<'idle' | 'processing'>('idle');
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    onLockChange?.(phase === 'processing');
  }, [phase, onLockChange]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setPayError(null);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    if (!quote) return;
    setPhase('processing');
    track('payment_submitted', { target: target.kind, cover_fees: cover });
    try {
      const ready = await payRef.current?.validate();
      if (ready && !ready.ok) throw new Error(ready.error);
      const lineKey = `${target.kind}:${amount}:${cover}:${sendExtra}:${restNeeds.map((n) => n.id).join(',')}`;
      const res = await fetch('/api/give', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: config.team.id,
          target: target.kind,
          athleteId: target.kind === 'athlete' || target.kind === 'fund_rest' ? target.athleteId : null,
          needIds: target.kind === 'need' ? [target.needId] : restNeeds.map((n) => n.id),
          amountCents: amount,
          sendExtraToFund: sendExtra && overMax,
          coverFees: cover,
          donorName: name.trim(),
          donorEmail: email.trim(),
          showName,
          message: message.trim(),
          idempotencyKey: `${sessionKey.current}-${lineKey.length}-${hash(lineKey)}`,
          sourceToken: config.sourceToken,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'The payment did not go through. Try again.');
      const result = await payRef.current!.confirm({ donationId: data.donationId, clientSecret: data.clientSecret, totalCents: data.quote.totalCents });
      if (!result.ok) throw new Error(result.error);
      track('payment_succeeded', { target: target.kind });
      router.push(`/give/success/${data.donationId}`);
    } catch (err) {
      // A failed attempt is final on the server, so the next try is a new gift.
      sessionKey.current = randomKey();
      setPhase('idle');
      setPayError((err as Error).message || 'The payment did not go through. Try again.');
      requestAnimationFrame(() => summaryRef.current?.focus());
    }
  };

  // The sheet can't take money for a need that's gone.
  if (target.kind === 'need' && !need) {
    return <Banner tone="info">This item isn&apos;t available anymore.</Banner>;
  }
  if (!config.team.acceptsGifts) {
    return <Banner tone="warn">This team can&apos;t accept gifts right now.</Banner>;
  }

  const nextSuggestion =
    maxCents <= 0 && target.kind === 'need' && need?.athleteId
      ? needs.filter((n) => n.athleteId === need.athleteId && needLeft(n) > 0).sort((a, b) => needLeft(b) - needLeft(a))[0]
      : undefined;

  const errorList = submitted ? Object.entries(errors) : [];
  const labels: Record<string, string> = { amount: 'Amount', email: 'Email', name: 'Name' };

  return (
    <form id={`${uid}-form`} onSubmit={submit} noValidate className="flex flex-col gap-6">
      {(errorList.length > 0 || payError) && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-[12px] bg-error-bg px-4 py-3 outline-none">
          {payError ? (
            <p className="text-[15px] text-ink-body">{payError}</p>
          ) : (
            <>
              <p className="text-[15px] font-medium text-ink">Fix {errorList.length === 1 ? 'this' : 'these'} to continue:</p>
              <ul className="mt-1 list-disc pl-5 text-[15px]">
                {errorList.map(([f, m]) => (
                  <li key={f}>
                    <a href={`#${uid}-${f}`} className="text-error">
                      {labels[f]}: {m}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {notice && (
        <Banner tone="info" rounded>
          {notice}
          {nextSuggestion && onRetarget && (
            <>
              {' '}
              <button type="button" className="font-medium text-primary underline" onClick={() => onRetarget({ kind: 'need', needId: nextSuggestion.id, entry: 'card' })}>
                Give to {nextSuggestion.name} instead
              </button>
            </>
          )}
        </Banner>
      )}

      {/* 1. What you're funding */}
      <section aria-label="What you're funding">
        {target.kind === 'need' && need && <NeedSummary need={need} teamName={config.team.name} />}
        {target.kind === 'fund_rest' && (
          <div className="flex flex-col gap-2">
            <p className="t-label">Everything left on {athleteName}&apos;s list</p>
            <ul className="divide-y divide-hairline-soft rounded-[12px] border border-hairline-soft">
              {restNeeds.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-1 pl-3 pr-1">
                  <GearArt name={n.name} category={n.category} size={22} tile={false} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink-list">{n.name}</span>
                  <span className="tabular text-[15px] text-ink">{money(needLeft(n))}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${n.name}`}
                    disabled={restNeeds.length <= 1 || phase === 'processing'}
                    onClick={() => setRemoved((s) => new Set(s).add(n.id))}
                    className="inline-flex size-11 items-center justify-center rounded-md text-ink-nav hover:bg-chrome disabled:opacity-30"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="flex justify-between text-[15px]">
              <span className="text-ink-meta">{restNeeds.length} items</span>
              <span className="tabular font-medium text-ink">{money(maxCents)}</span>
            </p>
          </div>
        )}
        {target.kind === 'athlete' && (
          <div className="flex items-start gap-3">
            <GearArt name="Team fund" category="team_fund" size={56} />
            <div>
              <p className="t-label text-[16px]">Any amount for {athleteName}</p>
              <p className="t-caption">Spread across {recipientFirst}&apos;s open items, smallest first. {moneyWhole(maxCents)} left in total.</p>
            </div>
          </div>
        )}
        {target.kind === 'team_fund' && (
          <div className="flex items-start gap-3">
            <GearArt name="Team fund" category="team_fund" size={56} />
            <div>
              <p className="t-label text-[16px]">Team fund for {config.team.name}</p>
              <p className="t-caption">Helps where it&apos;s needed most. The coach spends it on team gear and items players still need.</p>
            </div>
          </div>
        )}
      </section>

      {/* 2. Amount */}
      {target.kind !== 'fund_rest' && (
        <fieldset ref={amountRef} id={`${uid}-amount`} tabIndex={-1} className="flex flex-col gap-3 outline-none">
          <legend className="t-label mb-3">Amount</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Amount">
            {chips.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={activeChip === c.id}
                data-autofocus={i === 0 ? true : undefined}
                onClick={() => {
                  setChoice(c.choice);
                  setNotice(null);
                  track('give_amount_selected', { chip: c.id });
                }}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-[15px] font-semibold tabular transition-colors duration-150',
                  activeChip === c.id ? 'border-ink bg-ink text-white' : 'border-[#cfd6e1] bg-canvas text-ink hover:border-ink',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {choice.kind === 'other' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-other`} className="t-label">
                Other amount
              </label>
              <div className="relative max-w-[200px]">
                <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-ink-meta">
                  $
                </span>
                <input
                  id={`${uid}-other`}
                  inputMode="decimal"
                  autoComplete="transaction-amount"
                  autoFocus
                  value={other}
                  onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))}
                  onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                  aria-invalid={Boolean(show('amount')) || undefined}
                  aria-describedby={`${uid}-other-help`}
                  className="h-11 w-full rounded-[10px] border border-hairline pl-7 pr-3 text-[16px] tabular text-ink focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none aria-[invalid=true]:border-error"
                />
              </div>
              <p id={`${uid}-other-help`} className="t-caption">
                {Number.isFinite(maxCents) ? `Max ${moneyWhole(maxCents)} for this ${target.kind === 'need' ? 'item' : 'player'}.` : `At least ${moneyWhole(config.minGiftCents)}.`}
              </p>
            </div>
          )}
          {overMax && (
            <div className="flex flex-col gap-1 rounded-[12px] bg-band-blue px-4 py-3">
              <p className="text-[15px] text-ink-body">
                This {target.kind === 'need' ? 'item' : 'player'} only needs {moneyWhole(maxCents)}. Anything extra can go to the team fund.
              </p>
              <Checkbox id={`${uid}-extra`} checked={sendExtra} onChange={(e) => setSendExtra(e.target.checked)} label="Send extra to the team fund" />
            </div>
          )}
          {show('amount') && (
            <p className="text-[14px] text-error" role="alert">
              {errors.amount}
            </p>
          )}
        </fieldset>
      )}

      {/* 3. Your details */}
      <fieldset className="flex flex-col gap-4">
        <legend className="t-label mb-3">Your details</legend>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-email`} className="t-label">
            Email <span className="font-normal text-ink-meta">Required, for your receipt</span>
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={Boolean(show('email')) || undefined}
            aria-describedby={show('email') ? `${uid}-email-err` : undefined}
            className="h-11 rounded-[10px] border border-hairline px-3.5 text-[16px] text-ink focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none aria-[invalid=true]:border-error"
          />
          {show('email') && <p id={`${uid}-email-err`} className="text-[14px] text-error">{errors.email}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-name`} className="t-label">
            Name <span className="font-normal text-ink-meta">Required</span>
          </label>
          <input
            id={`${uid}-name`}
            autoComplete="name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            aria-invalid={Boolean(show('name')) || undefined}
            aria-describedby={show('name') ? `${uid}-name-err` : undefined}
            className="h-11 rounded-[10px] border border-hairline px-3.5 text-[16px] text-ink focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none aria-[invalid=true]:border-error"
          />
          {show('name') && <p id={`${uid}-name-err`} className="text-[14px] text-error">{errors.name}</p>}
          <Checkbox
            id={`${uid}-show`}
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
            label={athleteName ? `Show my name on ${recipientFirst}'s page` : 'Show my name to the team'}
            hint={showName ? undefined : 'You will appear as "A supporter". You still get a receipt.'}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${uid}-msg`} className="t-label">
              Message to {athleteName ? recipientFirst : 'the team'} <span className="font-normal text-ink-meta">Optional</span>
            </label>
            <span className={cn('tabular text-[13px]', message.length > 190 ? 'text-warn' : 'text-ink-meta')} aria-live="polite">
              {message.length}/200
            </span>
          </div>
          <textarea
            id={`${uid}-msg`}
            value={message}
            maxLength={200}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={`${uid}-msg-help`}
            className="rounded-[10px] border border-hairline px-3.5 py-2 text-[16px] text-ink focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none"
          />
          <p id={`${uid}-msg-help`} className="t-caption">
            {config.team.requireMessageApproval ? `Messages are reviewed before ${athleteName ? recipientFirst : 'anyone'} sees them.` : 'Messages with links or contact details are reviewed first.'}
          </p>
        </div>
      </fieldset>

      {/* 4. Total and pay */}
      <section aria-label="Total and payment" className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2 rounded-[12px] bg-chrome px-4 py-3 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-ink-body">Gift</dt>
            <dd className="tabular text-ink">{money(amount)}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="-my-2">
              <Checkbox
                id={`${uid}-cover`}
                checked={cover}
                onChange={(e) => {
                  setCover(e.target.checked);
                  track('give_fees_toggled', { on: e.target.checked });
                }}
                label={`Cover fees so ${recipientFirst} gets the full ${moneyWhole(amount)}`}
              />
            </dt>
            <dd className="tabular pt-0.5 text-ink">{quote && cover ? money(quote.feesAddedCents) : money(0)}</dd>
          </div>
          {!cover && quote && (
            <p className="t-caption">Fees of {money(quote.totalCents - quote.netCents)} come out of the gift, so {money(quote.netCents)} reaches the team.</p>
          )}
          <div className="flex justify-between border-t border-hairline-soft pt-2">
            <dt className="font-medium text-ink">Total</dt>
            <dd className="t-figure">{money(quote?.totalCents ?? 0)}</dd>
          </div>
        </dl>
        <div>
          <button type="button" aria-expanded={feesHelp} onClick={() => setFeesHelp((v) => !v)} className="min-h-9 text-[15px] text-primary hover:underline">
            How fees work
          </button>
          {feesHelp && (
            <p className="t-caption mt-1">
              Gridiron Give charges {money(config.fees.platformFixedCents).replace('.00', '')} + {config.fees.platformBasisPoints / 100}% per gift to run the site.
              Stripe charges {config.fees.stripeBasisPoints / 100}% + {config.fees.stripeFixedCents}¢ to process the card. When you cover fees we add both, so the full
              gift reaches the team.
            </p>
          )}
        </div>

        {config.payments.mode === 'stripe' && config.payments.publishableKey ? (
          <StripePay
            ref={payRef}
            publishableKey={config.payments.publishableKey}
            amountCents={Math.max(quote?.totalCents ?? 500, 500)}
            onBehalfOf={config.team.stripeAccountId}
            email={email}
          />
        ) : (
          <SimulatedPay ref={payRef} />
        )}

        <div className={cn('flex flex-col-reverse gap-3 sm:flex-row sm:justify-end', !standalone && 'sticky -bottom-5 -mx-6 -mb-5 border-t border-hairline-soft bg-canvas px-6 pb-5 pt-3')}>
          {onClose && (
            <Button variant="secondary" onClick={onClose} disabled={phase === 'processing'}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={phase === 'processing'} loadingLabel="Processing" disabled={maxCents <= 0} className="sm:min-w-48">
            Pay {money(quote?.totalCents ?? 0)}
          </Button>
        </div>
        <p className="t-caption">
          Payments are processed by Stripe. Gridiron Give never stores card numbers. By giving you agree to the <a href="/terms">Terms</a>.
        </p>
      </section>
    </form>
  );
}

function NeedSummary({ need, teamName }: { need: GiveNeed; teamName: string }) {
  const left = needLeft(need);
  return (
    <div className="flex items-start gap-3">
      <GearArt name={need.name} category={need.category} size={56} />
      <div className="min-w-0">
        <p className="t-label text-[16px]">
          {need.name} for {need.athleteName ?? teamName}
        </p>
        {need.variant && <p className="t-caption">{need.variant}</p>}
        <p className="text-[15px] tabular text-ink-body">
          {moneyWhole(need.raisedCents)} of {moneyWhole(need.priceCents ?? 0)} raised · <span className="font-medium text-ink">{moneyWhole(left)} left</span>
        </p>
      </div>
    </div>
  );
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
