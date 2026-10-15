'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Download, FileUp } from 'lucide-react';
import { Stepper } from '@/components/ui/Stepper';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Select, Textarea, Checkbox, Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Banner';
import { Chip } from '@/components/ui/Chip';
import { importRoster } from '@/lib/app/team-actions';
import {
  IMPORT_FIELDS,
  TEMPLATE_CSV,
  autoMapColumns,
  checkRows,
  rowFromCells,
  type ColumnMap,
  type ExistingAthlete,
  type ImportField,
  type ImportRow,
} from '@/lib/domain/roster-import';
import { cn } from '@/components/ui/cn';

const STEPS = ['Upload', 'Map columns', 'Review', 'Confirm'];
const MAX_ROWS = 300;

type Grid = string[][];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function tidy(grid: Grid): Grid {
  return grid.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ''));
}

export function ImportWizard({ teamId, existing, templates }: { teamId: string; existing: ExistingAthlete[]; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [grid, setGrid] = useState<Grid>([]);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [sendInvites, setSendInvites] = useState(true);
  const [templateId, setTemplateId] = useState('auto');
  const [result, setResult] = useState<{ added: number; skipped: number; invited: number; noEmail: number; noEmailAthletes: { id: string; name: string }[] } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [onlyIssues, setOnlyIssues] = useState(false);

  const headers = grid[0] ?? [];
  const body = grid.slice(1);
  const checks = useMemo(() => checkRows(rows, existing), [rows, existing]);
  const counts = {
    ready: checks.filter((c) => c.level === 'ready').length,
    warning: checks.filter((c) => c.level === 'warning').length,
    error: checks.filter((c) => c.level === 'error').length,
  };
  const importable = counts.ready + counts.warning;
  const withEmail = checks.filter((c) => c.level !== 'error' && c.row.guardian_email).length;

  const load = (g: Grid, name: string) => {
    const t = tidy(g);
    if (t.length < 2) {
      setReadError('We need a header row and at least one athlete.');
      return;
    }
    if (t.length - 1 > MAX_ROWS) {
      setReadError(`That's ${t.length - 1} rows. Import up to ${MAX_ROWS} at a time.`);
      return;
    }
    setReadError(null);
    setGrid(t);
    setFileName(name);
    setMap(autoMapColumns(t[0]));
    setStep(1);
  };

  const onFile = async (file: File) => {
    setReadError(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const data = await readSheet(file);
        load(data as unknown as Grid, file.name);
      } else if (/\.(csv|txt|tsv)$/i.test(file.name) || file.type.startsWith('text/')) {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
        load(parsed.data, file.name);
      } else {
        setReadError('Upload a .csv or .xlsx file.');
      }
    } catch {
      setReadError("We couldn't read that file. Save it as CSV and try again.");
    }
  };

  const onPaste = () => {
    // Spreadsheets paste as tab-separated text; Papa detects tabs or commas.
    const parsed = Papa.parse<string[]>(paste.trim(), { skipEmptyLines: true, delimiter: '' });
    load(parsed.data, 'Pasted rows');
  };

  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && map[f.key] === undefined);

  const toReview = () => {
    setRows(body.map((cells) => rowFromCells(cells, map)));
    setStep(2);
  };

  const editRow = (i: number, k: keyof ImportRow, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: k === 'grade' ? (v ? Number(v) || null : null) : k === 'guardian_email' || k === 'athlete_email' ? v.trim().toLowerCase() : k === 'position' ? v.toUpperCase() : v } : r)));
  const dropRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const submit = () =>
    start(async () => {
      setSubmitError(null);
      const r = await importRoster(teamId, rows, { sendInvites, templateId });
      if (!r.ok) {
        setSubmitError(r.error);
        return;
      }
      setResult(r.data!);
      router.refresh();
    });

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;

  if (result) {
    return (
      <div className="flex max-w-[720px] flex-col gap-5">
        <Banner tone="success" rounded>
          {result.added} added.{sendInvites ? ` ${result.invited} ${result.invited === 1 ? 'invite' : 'invites'} sent.` : ''}
          {result.noEmail ? ` ${result.noEmail} ${result.noEmail === 1 ? 'has' : 'have'} no guardian email.` : ''}
          {result.skipped ? ` ${result.skipped} skipped because of errors.` : ''}
        </Banner>
        {result.noEmailAthletes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="t-body">Add a guardian email so these families get an invite:</p>
            <ul className="flex flex-col divide-y divide-hairline-soft rounded-md border border-hairline-soft">
              {result.noEmailAthletes.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/manager/${teamId}/roster/${a.id}?tab=contacts`} className="flex min-h-11 items-center justify-between gap-3 px-4">
                    <span>{a.name}</span>
                    <span className="t-caption">Add email</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/app/manager/${teamId}/roster`}>Go to roster</ButtonLink>
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setGrid([]);
              setRows([]);
              setPaste('');
              setStep(0);
            }}
          >
            Import more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS.map((label, i) => ({ label, done: i < step }))} current={step} />

      {step === 0 && (
        <div className="flex max-w-[720px] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label
              htmlFor="import-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed border-hairline px-6 py-10 text-center hover:border-primary hover:bg-band-blue"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
            >
              <FileUp size={28} aria-hidden className="text-primary" />
              <span className="text-[16px] font-medium text-ink">Choose a CSV or Excel file</span>
              <span className="t-caption">or drag it here</span>
            </label>
            <input id="import-file" type="file" accept=".csv,.xlsx,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <a href={templateHref} download="gridiron-give-roster-template.csv" className="inline-flex min-h-11 items-center gap-2 self-start text-[15px]">
              <Download size={16} aria-hidden /> Download the template
            </a>
            <p className="t-caption">
              Columns: {IMPORT_FIELDS.map((f) => f.label + (f.required ? '' : ' (optional)')).join(', ')}. Column names don&apos;t have to match exactly.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Field id="import-paste" label="Or paste rows from a spreadsheet" helper="Include the header row.">
              <Textarea id="import-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} className="font-mono text-[14px]" aria-describedby="import-paste-help" />
            </Field>
            <Button variant="secondary" className="self-start" disabled={!paste.trim()} onClick={onPaste}>
              Use pasted rows
            </Button>
          </div>
          {readError && (
            <Banner tone="error" rounded>
              {readError}
            </Banner>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <p className="t-body">
            {fileName}: {body.length} {body.length === 1 ? 'row' : 'rows'}. Check that each column went to the right place.
          </p>
          <div className="grid max-w-[880px] gap-4 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <Field key={f.key} id={`map-${f.key}`} label={f.label} required={f.required} optional={!f.required}>
                <Select
                  id={`map-${f.key}`}
                  value={map[f.key] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? undefined : Number(e.target.value);
                    setMap((m) => {
                      const next: ColumnMap = { ...m };
                      // One column feeds one field.
                      for (const k of Object.keys(next) as ImportField[]) if (v !== undefined && next[k] === v) delete next[k];
                      if (v === undefined) delete next[f.key];
                      else next[f.key] = v;
                      return next;
                    });
                  }}
                >
                  <option value="">Not in this file</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <section aria-labelledby="preview-h" className="flex flex-col gap-2">
            <h2 id="preview-h" className="t-subhead">
              First 5 rows
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[14px]">
                <thead className="t-caption">
                  <tr className="border-b border-hairline">
                    {IMPORT_FIELDS.map((f) => (
                      <th key={f.key} scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, 5).map((cells, i) => {
                    const r = rowFromCells(cells, map);
                    return (
                      <tr key={i} className="border-b border-hairline-soft">
                        {IMPORT_FIELDS.map((f) => (
                          <td key={f.key} className="py-2 pr-4 whitespace-nowrap">
                            {String(r[f.key] ?? '') || <span className="text-ink-meta">None</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {missingRequired.length > 0 && (
            <Banner tone="warn" rounded>
              Choose a column for {missingRequired.map((f) => f.label.toLowerCase()).join(' and ')}.
            </Banner>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={missingRequired.length > 0} onClick={toReview}>
              Review rows
            </Button>
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
            <Chip tone="funded" icon="check">{counts.ready} ready</Chip>
            <Chip tone="warn" icon="alert">{counts.warning} with warnings</Chip>
            <Chip tone="error" icon="alert">{counts.error} with errors</Chip>
            <span className="t-caption">Rows with errors are skipped. Fix them here or in your file.</span>
          </div>
          <Checkbox id="only-issues" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} label="Show only rows with issues" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-[14px]">
              <thead className="t-caption">
                <tr className="border-b border-hairline">
                  <th scope="col" className="py-2 pr-2 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-2 font-medium">First name</th>
                  <th scope="col" className="py-2 pr-2 font-medium">Last name</th>
                  <th scope="col" className="w-16 py-2 pr-2 font-medium">#</th>
                  <th scope="col" className="w-20 py-2 pr-2 font-medium">Pos</th>
                  <th scope="col" className="w-20 py-2 pr-2 font-medium">Grade</th>
                  <th scope="col" className="py-2 pr-2 font-medium">Guardian email</th>
                  <th scope="col" className="py-2 pr-2 font-medium">Athlete email</th>
                  <th scope="col" className="py-2 font-medium"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) =>
                  onlyIssues && c.level === 'ready' ? null : (
                    <tr key={i} className={cn('border-b border-hairline-soft align-top', c.level === 'error' && 'bg-error-bg/50')}>
                      <td className="py-2 pr-2">
                        {c.level === 'ready' ? <Chip tone="funded">Ready</Chip> : c.level === 'warning' ? <Chip tone="warn">Warning</Chip> : <Chip tone="error">Error</Chip>}
                        {c.issues.length > 0 && (
                          <ul className="mt-1 max-w-[220px] text-[13px] leading-5 text-ink-meta">
                            {c.issues.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {(['first_name', 'last_name', 'jersey', 'position', 'grade', 'guardian_email', 'athlete_email'] as const).map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <label className="sr-only" htmlFor={`r${i}-${k}`}>
                            {IMPORT_FIELDS.find((f) => f.key === k)?.label} for row {i + 1}
                          </label>
                          <Input
                            id={`r${i}-${k}`}
                            value={c.row[k] === null ? '' : String(c.row[k])}
                            onChange={(e) => editRow(i, k, e.target.value)}
                            type={k.endsWith('email') ? 'email' : 'text'}
                            inputMode={k === 'jersey' || k === 'grade' ? 'numeric' : undefined}
                            className="min-h-10 px-2 py-1 text-[14px]"
                          />
                        </td>
                      ))}
                      <td className="py-2">
                        <Button variant="tertiary" size="sm" onClick={() => dropRow(i)} aria-label={`Remove row ${i + 1}`}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={importable === 0} onClick={() => setStep(3)}>
              Continue with {importable} {importable === 1 ? 'athlete' : 'athletes'}
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex max-w-[640px] flex-col gap-5">
          <p className="t-body">
            {importable} {importable === 1 ? 'athlete' : 'athletes'} will be added.
            {counts.error ? ` ${counts.error} ${counts.error === 1 ? 'row' : 'rows'} with errors will be skipped.` : ''}
          </p>
          <Field id="imp-tpl" label="Starting gear list" helper="You can change any athlete's gear later.">
            <Select id="imp-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-describedby="imp-tpl-help">
              <option value="auto">Match each athlete&apos;s position</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="none">Start empty</option>
            </Select>
          </Field>
          <Checkbox
            id="imp-invite"
            checked={sendInvites}
            onChange={(e) => setSendInvites(e.target.checked)}
            label="Send invites now"
            hint={`${withEmail} of ${importable} have a guardian email. Each guardian gives consent before anything is public.`}
          />
          {submitError && (
            <Banner tone="error" rounded>
              {submitError}
            </Banner>
          )}
          <div className="flex flex-wrap gap-3">
            <Button loading={pending} onClick={submit}>
              Add {importable} {importable === 1 ? 'athlete' : 'athletes'}
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)} disabled={pending}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
