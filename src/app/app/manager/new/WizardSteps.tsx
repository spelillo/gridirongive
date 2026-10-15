'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Upload, FileCheck2, Check, Plus } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Field, Fieldset, Input, Select, Textarea, describedBy } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/lib/domain/money';
import { slugify } from '@/lib/domain/names';
import { uploadTeamFile } from '@/lib/app/upload-client';
import {
  saveAccountStep, createDraftTeam, updateDraftTeam, checkSlug, searchOrganizations, submitVerification, chooseTemplate, publishTeam,
} from '@/lib/app/team-settings-actions';

const ROLES = ['Head coach', 'Assistant coach', 'Team manager', 'Booster officer'];
const LEVELS: [string, string][] = [['varsity', 'Varsity'], ['jv', 'JV'], ['freshman', 'Freshman'], ['youth', 'Youth'], ['club', 'Club']];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ErrorSummary({ errors, focusRef }: { errors: Record<string, string>; focusRef: React.RefObject<HTMLDivElement | null> }) {
  const list = Object.entries(errors).filter(([, v]) => v);
  return (
    <div ref={focusRef} tabIndex={-1} className="outline-none">
      {list.length > 0 && (
        <Banner tone="error" rounded>
          <p className="font-medium">Fix {list.length === 1 ? 'this' : 'these'} to continue:</p>
          <ul className="list-disc pl-5">
            {list.map(([k, v]) => (
              <li key={k}>
                <a href={`#${k}`}>{v}</a>
              </li>
            ))}
          </ul>
        </Banner>
      )}
    </div>
  );
}

// Step 1 ------------------------------------------------------------------------

export function AccountStep({ fullName, phone, title, teamId }: { fullName: string; phone: string; title: string; teamId: string | null }) {
  const [v, setV] = useState({ fullName, phone, title: ROLES.includes(title) ? title : 'Head coach' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const summary = useRef<HTMLDivElement>(null);
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (v.fullName.trim().length < 2) errs['full-name'] = 'Enter your name.';
        setErrors(errs);
        if (Object.keys(errs).length) return requestAnimationFrame(() => summary.current?.focus());
        start(async () => {
          const r = await saveAccountStep(v);
          if (!r.ok) {
            setErrors({ [r.field ?? 'full-name']: r.error });
            requestAnimationFrame(() => summary.current?.focus());
            return;
          }
          const q = new URLSearchParams({ step: '2', title: v.title });
          if (teamId) q.set('team', teamId);
          else q.set('fresh', '1');
          router.push(`/app/manager/new?${q}`);
        });
      }}
    >
      <ErrorSummary errors={errors} focusRef={summary} />
      <h2 className="t-section">Your account</h2>
      <Field id="full-name" label="Your name" required error={errors['full-name']}>
        <Input id="full-name" autoComplete="name" value={v.fullName} maxLength={80} onChange={(e) => setV({ ...v, fullName: e.target.value })} aria-invalid={Boolean(errors['full-name']) || undefined} aria-describedby={describedBy('full-name', errors['full-name'])} />
      </Field>
      <Field id="role" label="Your role" required>
        <Select id="role" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })}>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
      <Field id="phone" label="Phone" optional helper="Only for payout alerts. Never shown to anyone." error={errors.phone}>
        <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" value={v.phone} maxLength={30} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-invalid={Boolean(errors.phone) || undefined} aria-describedby={describedBy('phone', errors.phone, true)} />
      </Field>
      <div className="flex justify-end border-t border-hairline-soft pt-5">
        <Button type="submit" loading={pending} loadingLabel="Saving" fullMobile>
          Continue
        </Button>
      </div>
    </form>
  );
}

// Step 2 ------------------------------------------------------------------------

type Org = { id: string; name: string; city: string; state: string; domain: string | null };

function SchoolSearch({ onPick, error }: { onPick: (o: Org | null) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchOrganizations(q).catch(() => []);
      setResults(r);
      setLoading(false);
      setOpen(true);
      setActive(-1);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 ? results : [];
  const pick = (o: Org) => {
    onPick(o);
    setOpen(false);
  };
  return (
    <Field id="school" label="School or club" required error={error} helper="Search by school name or town.">
      <div className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-meta" />
        <Input
          id="school"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy('school', error, true)}
          autoComplete="off"
          className="pl-10"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onPick(null);
          }}
          onFocus={() => shown.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
              e.preventDefault();
              pick(shown[active]);
              setQ(`${shown[active].name}, ${shown[active].city}, ${shown[active].state}`);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-meta">
            <Spinner size={16} />
          </span>
        )}
        {open && shown.length > 0 && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-hairline-soft bg-canvas shadow-pop">
            {shown.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-2 ${i === active ? 'bg-band-blue' : 'hover:bg-chrome'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                  setQ(`${o.name}, ${o.city}, ${o.state}`);
                }}
              >
                <span className="text-[15px] text-ink">{o.name}</span>
                <span className="t-caption">
                  {o.city}, {o.state}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {open && q.trim().length >= 2 ? `${shown.length} ${shown.length === 1 ? 'school' : 'schools'} found` : ''}
      </p>
    </Field>
  );
}

interface TeamInitial {
  orgName: string;
  sport: string;
  level: string;
  name: string;
  slug: string;
  seasonLabel: string;
  startsOn: string;
  endsOn: string;
  about: string;
}

function shortOrg(name: string) {
  return name.replace(/\s+(School|Schools)$/i, '').trim();
}

export function TeamStep({ teamId, sports, title, appHost, initial }: { teamId: string | null; sports: string[]; title: string; appHost: string; initial: TeamInitial | null }) {
  const year = new Date().getFullYear();
  const [org, setOrg] = useState<Org | null>(null);
  const [adding, setAdding] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', city: '', state: '', website: '' });
  const [v, setV] = useState<TeamInitial>(
    initial ?? { orgName: '', sport: sports.includes('football') ? 'football' : sports[0] ?? 'football', level: 'varsity', name: '', slug: '', seasonLabel: `Fall ${year}`, startsOn: '', endsOn: '', about: '' },
  );
  const [touched, setTouched] = useState({ name: Boolean(initial), slug: Boolean(initial) });
  const [slugState, setSlugState] = useState<{ ok: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const summary = useRef<HTMLDivElement>(null);

  const orgLabel = org?.name ?? (adding ? newOrg.name : '');
  // Prefill "Central High Varsity Football" and "central-high-football" until edited.
  const auto = (o: string, level: string, sport: string) => {
    const short = shortOrg(o);
    const lvl = LEVELS.find((l) => l[0] === level)?.[1] ?? '';
    return { name: short ? `${short} ${lvl} ${cap(sport)}` : '', slug: short ? slugify(`${short} ${level === 'varsity' ? '' : level} ${sport}`) : '' };
  };
  const clear = (...keys: string[]) => setErrors((e) => (keys.some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  const update = (patch: Partial<TeamInitial>, orgName = orgLabel) => {
    if (orgName && !touched.name) clear('team-name', 'slug');
    setV((cur) => {
      const next = { ...cur, ...patch };
      const a = auto(orgName, next.level, next.sport);
      if (!touched.name && a.name) next.name = a.name;
      if (!touched.slug && !teamId) next.slug = a.slug || slugify(next.name);
      return next;
    });
  };

  useEffect(() => {
    if (!v.slug || v.slug.length < 3) return;
    const t = setTimeout(async () => {
      const r = await checkSlug(v.slug, teamId ?? undefined).catch(() => null);
      if (r) setSlugState({ ok: r.ok, message: r.message });
    }, 300);
    return () => clearTimeout(t);
  }, [v.slug, teamId]);
  const slugMsg = v.slug.length < 3 ? null : slugState;

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!teamId && !org && !adding) errs.school = 'Find your school, or add it.';
    if (adding && !teamId) {
      if (newOrg.name.trim().length < 3) errs['org-name'] = 'Enter the school or club name.';
      if (!newOrg.city.trim()) errs['org-city'] = 'Enter the city.';
      if (!/^[A-Za-z]{2}$/.test(newOrg.state.trim())) errs['org-state'] = 'Use the 2-letter state, like TN.';
    }
    if (v.name.trim().length < 3) errs['team-name'] = 'Enter the team name.';
    if (!v.seasonLabel.trim()) errs['season-label'] = 'Enter a season label, like Fall 2026.';
    if (slugMsg && !slugMsg.ok) errs.slug = slugMsg.message;
    setErrors(errs);
    if (Object.keys(errs).length) return requestAnimationFrame(() => summary.current?.focus());
    start(async () => {
      const base = { sport: v.sport, level: v.level, name: v.name, slug: v.slug, seasonLabel: v.seasonLabel, startsOn: v.startsOn, endsOn: v.endsOn, about: v.about, title };
      const r = teamId ? await updateDraftTeam(teamId, base) : await createDraftTeam({ ...base, orgId: org?.id ?? null, newOrg: adding ? newOrg : null });
      if (!r.ok) {
        setErrors({ [r.field ?? 'team-name']: r.error });
        requestAnimationFrame(() => summary.current?.focus());
        return;
      }
      router.push(r.redirect ?? '/app/manager/new');
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorSummary errors={errors} focusRef={summary} />
      <h2 className="t-section">Team</h2>
      {teamId ? (
        <div>
          <p className="t-label">School or club</p>
          <p className="t-body">{v.orgName}</p>
        </div>
      ) : adding ? (
        <Fieldset legend="Add a school or club">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="org-name" label="Name" required error={errors['org-name']} className="sm:col-span-2">
              <Input id="org-name" value={newOrg.name} maxLength={120} placeholder="Central High School" aria-invalid={Boolean(errors['org-name']) || undefined} aria-describedby={describedBy('org-name', errors['org-name'])}
                onChange={(e) => {
                  setNewOrg({ ...newOrg, name: e.target.value });
                  update({}, e.target.value);
                }}
              />
            </Field>
            <Field id="org-city" label="City" required error={errors['org-city']}>
              <Input id="org-city" value={newOrg.city} maxLength={80} autoComplete="address-level2" onChange={(e) => setNewOrg({ ...newOrg, city: e.target.value })} aria-invalid={Boolean(errors['org-city']) || undefined} aria-describedby={describedBy('org-city', errors['org-city'])} />
            </Field>
            <Field id="org-state" label="State" required error={errors['org-state']} helper="2 letters, like TN">
              <Input id="org-state" value={newOrg.state} maxLength={2} autoComplete="address-level1" className="uppercase" onChange={(e) => setNewOrg({ ...newOrg, state: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors['org-state']) || undefined} aria-describedby={describedBy('org-state', errors['org-state'], true)} />
            </Field>
            <Field id="org-website" label="Website" optional helper="If your email is on this website's domain, the team is verified automatically." error={errors['org-website']} className="sm:col-span-2">
              <Input id="org-website" type="url" inputMode="url" value={newOrg.website} maxLength={200} placeholder="https://www.centralhigh.org" onChange={(e) => setNewOrg({ ...newOrg, website: e.target.value })} aria-describedby={describedBy('org-website', errors['org-website'], true)} />
            </Field>
          </div>
          <div>
            <Button variant="tertiary" onClick={() => setAdding(false)}>
              Search instead
            </Button>
          </div>
        </Fieldset>
      ) : (
        <div className="flex flex-col gap-2">
          <SchoolSearch
            error={errors.school}
            onPick={(o) => {
              setOrg(o);
              if (o) {
                clear('school');
                update({}, o.name);
              }
            }}
          />
          {org && (
            <p className="t-caption inline-flex items-center gap-1.5 text-funded">
              <Check size={16} aria-hidden /> {org.name}, {org.city}, {org.state}
            </p>
          )}
          <div>
            <Button variant="tertiary" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden /> Add a school
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sport" label="Sport" required error={errors.sport}>
          <Select id="sport" value={v.sport} onChange={(e) => update({ sport: e.target.value })}>
            {sports.map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="level" label="Level" required error={errors.level}>
          <Select id="level" value={v.level} onChange={(e) => update({ level: e.target.value })}>
            {LEVELS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="team-name" label="Team name" required error={errors['team-name']}>
        <Input
          id="team-name"
          value={v.name}
          maxLength={80}
          placeholder="Central High Varsity Football"
          onChange={(e) => {
            setTouched((t) => ({ ...t, name: true }));
            clear('team-name');
            const name = e.target.value;
            setV((cur) => ({ ...cur, name, slug: touched.slug || teamId ? cur.slug : slugify(name) }));
          }}
          aria-invalid={Boolean(errors['team-name']) || undefined}
          aria-describedby={describedBy('team-name', errors['team-name'])}
        />
      </Field>
      <Field
        id="slug"
        label="Web address"
        required
        error={errors.slug}
        helper={
          <span aria-live="polite">
            {appHost}/t/<span className="font-medium text-ink">{v.slug || 'your-team'}</span>
            {slugMsg && <span className={slugMsg.ok ? 'text-funded' : 'text-error'}> · {slugMsg.message}</span>}
          </span>
        }
      >
        <Input
          id="slug"
          value={v.slug}
          maxLength={60}
          onChange={(e) => {
            clear('slug');
            setTouched((t) => ({ ...t, slug: true }));
            setV({ ...v, slug: slugify(e.target.value.replace(/\s+/g, '-')) || e.target.value.toLowerCase() });
          }}
          aria-invalid={Boolean(errors.slug) || undefined}
          aria-describedby={describedBy('slug', errors.slug, true)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="season-label" label="Season" required error={errors['season-label']}>
          <Input id="season-label" value={v.seasonLabel} maxLength={40} onChange={(e) => { clear('season-label'); setV({ ...v, seasonLabel: e.target.value }); }} aria-invalid={Boolean(errors['season-label']) || undefined} aria-describedby={describedBy('season-label', errors['season-label'])} />
        </Field>
        <Field id="starts-on" label="Starts" optional>
          <Input id="starts-on" type="date" value={v.startsOn} onChange={(e) => setV({ ...v, startsOn: e.target.value })} />
        </Field>
        <Field id="ends-on" label="Ends" optional>
          <Input id="ends-on" type="date" value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} />
        </Field>
      </div>
      <Field id="about" label="About the team" optional error={errors.about} helper={`${v.about.length} of 1,000. Why you're raising money, shown on the public team page.`}>
        <Textarea id="about" value={v.about} maxLength={1000} rows={4} onChange={(e) => setV({ ...v, about: e.target.value })} aria-describedby={describedBy('about', errors.about, true)} />
      </Field>
      <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-5 sm:flex-row sm:justify-between">
        <ButtonLink href={teamId ? `/app/manager/new?team=${teamId}&step=1` : '/app/manager/new?fresh=1&step=1'} variant="secondary">
          Back
        </ButtonLink>
        <Button type="submit" loading={pending} loadingLabel="Saving">
          {teamId ? 'Save and continue' : 'Create team and continue'}
        </Button>
      </div>
    </form>
  );
}

// Step 3 ------------------------------------------------------------------------

export function VerifyStep({ teamId, status, method, contact, orgDomain, emailDomain }: { teamId: string; status: string; method: string | null; contact: string | null; orgDomain: string | null; emailDomain: string }) {
  const [how, setHow] = useState<'document' | 'contact'>(method === 'contact' ? 'contact' : 'document');
  const [doc, setDoc] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ad, setAd] = useState({ name: '', email: '' });
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const next = `/app/manager/new?team=${teamId}&step=4`;

  if (status === 'verified') {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="t-section">Verify</h2>
        <Banner tone="success">{method === 'domain' ? 'Verified automatically. Your email matches the school website.' : 'Verified.'}</Banner>
        <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-5 sm:flex-row sm:justify-between">
          <ButtonLink href={`/app/manager/new?team=${teamId}&step=2`} variant="secondary">
            Back
          </ButtonLink>
          <ButtonLink href={next}>Continue</ButtonLink>
        </div>
      </div>
    );
  }

  const submit = () => {
    const errs: Record<string, string> = {};
    if (how === 'document' && !doc) errs['verify-doc'] = 'Upload a staff ID or booster club letter.';
    if (how === 'contact') {
      if (ad.name.trim().length < 2) errs['ad-name'] = "Enter the athletic director's name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ad.email.trim())) errs['ad-email'] = "Enter the athletic director's email.";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return requestAnimationFrame(() => summary.current?.focus());
    start(async () => {
      const r = await submitVerification(teamId, { method: how, docKey: doc?.key, contactName: ad.name, contactEmail: ad.email, note });
      if (!r.ok) {
        setErrors({ [r.field ?? 'verify-doc']: r.error });
        requestAnimationFrame(() => summary.current?.focus());
        return;
      }
      toast(r.message ?? 'Sent for review');
      router.push(r.redirect ?? next);
    });
  };

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ErrorSummary errors={errors} focusRef={summary} />
      <div className="flex flex-col gap-1">
        <h2 className="t-section">Verify</h2>
        <p className="t-body">We check that you coach or manage this team before it can go live. You can keep building while it&apos;s checked.</p>
      </div>
      {status === 'under_review' && (
        <Banner tone="info">
          Under review{contact ? ` (contact: ${contact})` : method === 'document' ? ' (document sent)' : ''}. Most teams are verified within 1 business day. You can send something else below.
        </Banner>
      )}
      {status === 'rejected' && <Banner tone="error">We couldn&apos;t verify the team with what was sent. Try another document or contact.</Banner>}
      <p className="t-caption">
        {orgDomain
          ? `Your email is on ${emailDomain}, not the school's ${orgDomain}, so a person checks it.`
          : `The school has no website on file, so a person checks it. Signing in with a school email verifies teams automatically.`}
      </p>
      <Fieldset legend="How do you want to verify?">
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
          {(
            [
              ['document', 'Upload a document'],
              ['contact', 'Name an athletic director'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} htmlFor={`how-${k}`} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input id={`how-${k}`} type="radio" name="how" className="size-5 accent-primary" checked={how === k} onChange={() => setHow(k)} />
              <span className="text-[16px]">{l}</span>
            </label>
          ))}
        </div>
      </Fieldset>
      {how === 'document' ? (
        <Field id="verify-doc" label="Staff ID or booster club letter" required error={errors['verify-doc']} helper="A photo or PDF, up to 4 MB. Only Gridiron Give staff see it.">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id="verify-doc"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-describedby={describedBy('verify-doc', errors['verify-doc'], true)}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                setErrors({});
                const r = await uploadTeamFile(teamId, 'verification', f);
                setUploading(false);
                if (r.ok) setDoc({ key: r.key, name: f.name });
                else setErrors({ 'verify-doc': r.error });
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <Upload size={18} aria-hidden />} {doc ? 'Replace file' : 'Upload file'}
            </Button>
            <span className="t-caption" aria-live="polite">
              {uploading ? 'Uploading' : doc ? (
                <span className="inline-flex items-center gap-1.5 text-funded">
                  <FileCheck2 size={16} aria-hidden /> {doc.name}
                </span>
              ) : null}
            </span>
          </div>
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ad-name" label="Athletic director's name" required error={errors['ad-name']}>
            <Input id="ad-name" value={ad.name} maxLength={80} onChange={(e) => setAd({ ...ad, name: e.target.value })} aria-invalid={Boolean(errors['ad-name']) || undefined} aria-describedby={describedBy('ad-name', errors['ad-name'])} />
          </Field>
          <Field id="ad-email" label="Their email" required error={errors['ad-email']} helper="We email them to confirm.">
            <Input id="ad-email" type="email" value={ad.email} maxLength={200} onChange={(e) => setAd({ ...ad, email: e.target.value })} aria-invalid={Boolean(errors['ad-email']) || undefined} aria-describedby={describedBy('ad-email', errors['ad-email'], true)} />
          </Field>
        </div>
      )}
      <Field id="verify-note" label="Note for the reviewer" optional>
        <Textarea id="verify-note" value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-col-reverse gap-3 border-t border-hairline-soft pt-5 sm:flex-row sm:justify-between">
        <ButtonLink href={next} variant="secondary">
          {status === 'under_review' ? 'Continue' : 'Skip for now'}
        </ButtonLink>
        <Button type="submit" loading={pending} loadingLabel="Sending" disabled={uploading}>
          Send for review
        </Button>
      </div>
    </form>
  );
}

// Step 5 ------------------------------------------------------------------------

export function TemplateStep({ teamId, current, options }: { teamId: string; current: { id: string; name: string } | null; options: { id: string; name: string; items: number; total: number; positions: string[]; mine: boolean }[] }) {
  const [choice, setChoice] = useState(options.find((o) => o.name === current?.name)?.id ?? options.find((o) => o.name === 'Standard kit')?.id ?? options[0]?.id ?? '');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="t-section">Roster and gear</h2>
        <p className="t-body">Pick the default gear kit. Every new player starts with it, and players can turn off what they already have. Position kits (like kicker or lineman) apply automatically.</p>
      </div>
      {current && <Banner tone="success">Default kit: {current.name}. You can edit it in Gear templates.</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {options.length === 0 ? (
        <p className="t-body">There are no ready-made kits for this sport yet. Build one in Gear templates.</p>
      ) : (
        <Fieldset legend="Default kit">
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              <label key={o.id} htmlFor={`tpl-${o.id}`} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 ${choice === o.id ? 'border-primary bg-band-blue' : 'border-hairline-soft'}`}>
                <input id={`tpl-${o.id}`} type="radio" name="tpl" className="mt-0.5 size-5 accent-primary" checked={choice === o.id} onChange={() => setChoice(o.id)} />
                <span className="flex flex-col">
                  <span className="font-medium text-ink">{o.name}</span>
                  <span className="t-caption">
                    {o.items} items · {money(o.total)} per player{o.positions.length ? ` · for ${o.positions.join(', ')}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Fieldset>
      )}
      {options.length > 0 && (
        <div>
          <Button
            variant="secondary"
            loading={pending}
            loadingLabel="Saving"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await chooseTemplate(teamId, choice);
                if (!r.ok) setError(r.error);
                else {
                  toast(r.message ?? 'Saved');
                  router.refresh();
                }
              })
            }
          >
            Use this kit
          </Button>
        </div>
      )}
    </div>
  );
}

export function PublishButton({ teamId, disabled }: { teamId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={disabled}
        aria-describedby={disabled ? 'publish-reason' : undefined}
        loading={pending}
        loadingLabel="Publishing"
        onClick={() =>
          start(async () => {
            const r = await publishTeam(teamId);
            if (!r.ok) return setError(r.error);
            toast(r.message ?? 'Published');
            router.push(r.redirect ?? `/app/manager/${teamId}`);
          })
        }
      >
        Publish team
      </Button>
      {error && <p className="text-[14px] text-error" role="alert">{error}</p>}
    </div>
  );
}
