import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn';

export const inputClass =
  'block w-full min-h-11 rounded-[10px] border border-hairline bg-canvas px-3.5 py-2 text-[16px] leading-6 text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink-meta/80 hover:border-ink-meta focus:border-primary focus:shadow-[0_0_0_4px_rgba(23,71,209,0.22)] focus:outline-none focus-visible:outline-none disabled:bg-chrome disabled:text-ink-meta aria-[invalid=true]:border-error [&:read-only:not(select)]:bg-chrome';

interface FieldProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  helper?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  labelAside?: ReactNode;
}

/** Label above, helper and error below (ui-ux-spec 3, 10.3). "Required" is written out. */
export function Field({ id, label, required, optional, helper, error, children, className, labelAside }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="t-label">
          {label}
          {required && <span className="ml-1.5 font-normal text-ink-meta">Required</span>}
          {optional && <span className="ml-1.5 font-normal text-ink-meta">Optional</span>}
        </label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[14px] leading-5 text-error" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-help`} className="t-caption">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string | null, helper?: unknown) {
  return error ? `${id}-error` : helper ? `${id}-help` : undefined;
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cn(inputClass, className)} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cn(inputClass, 'min-h-28 py-2.5', className)} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select
      {...rest}
      className={cn(
        inputClass,
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23545454%22 stroke-width=%221.75%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_10px_center] bg-no-repeat pr-10",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, hint, className, id, ...rest }: ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-2', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input id={id} type="checkbox" {...rest} className="mt-0.5 size-5 shrink-0 accent-primary" />
      <span className="flex flex-col">
        <span className="text-[16px] leading-6 text-ink-body">{label}</span>
        {hint && <span className="t-caption">{hint}</span>}
      </span>
    </label>
  );
}

/** On/off switch built on a checkbox so forms and screen readers get real semantics. */
export function Switch({ label, hint, id, className, ...rest }: ComponentProps<'input'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={id} className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="flex flex-col">
        <span className="text-[16px] leading-6 text-ink-body">{label}</span>
        {hint && <span className="t-caption">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" {...rest} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full border border-hairline bg-band transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
        <span className="pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-canvas shadow-[0_1px_2px_rgba(0,0,0,.3)] transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Fieldset({ legend, children, className, hint }: { legend: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <fieldset className={cn('flex flex-col gap-1', className)}>
      <legend className="t-label mb-1">{legend}</legend>
      {hint && <p className="t-caption mb-1">{hint}</p>}
      {children}
    </fieldset>
  );
}
