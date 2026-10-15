import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md text-[16px] leading-[17.6px] font-medium select-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 whitespace-nowrap';

const variants: Record<ButtonVariant, string> = {
  primary: 'min-h-11 px-4 py-3 bg-primary text-on-primary hover:bg-primary-deep active:bg-primary-deep hover:text-on-primary',
  secondary: 'min-h-11 px-4 py-3 bg-canvas text-primary-deep border border-hairline hover:bg-band-blue active:bg-band-blue',
  tertiary: 'min-h-11 px-1 text-primary hover:text-primary-deep hover:underline',
  destructive: 'min-h-11 px-4 py-3 bg-canvas text-error border border-error hover:bg-error-bg',
};

export function buttonClass(variant: ButtonVariant = 'primary', opts: { full?: boolean; fullMobile?: boolean; size?: 'md' | 'sm' } = {}) {
  return cn(
    base,
    variants[variant],
    opts.full && 'w-full',
    opts.fullMobile && 'w-full md:w-auto',
    opts.size === 'sm' && variant !== 'tertiary' && 'min-h-9 px-3 py-2 text-[15px]',
  );
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
  full?: boolean;
  fullMobile?: boolean;
  size?: 'md' | 'sm';
  chevron?: boolean;
};

export function Button({ variant = 'primary', loading, loadingLabel, full, fullMobile, size, chevron, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass(variant, { full, fullMobile, size }), className)}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {children}
          {chevron && <ChevronRight aria-hidden size={18} strokeWidth={1.75} />}
        </>
      )}
    </button>
  );
}

type LinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  full?: boolean;
  fullMobile?: boolean;
  size?: 'md' | 'sm';
  chevron?: boolean;
  children: ReactNode;
};

export function ButtonLink({ variant = 'primary', full, fullMobile, size, chevron, className, children, ...rest }: LinkProps) {
  return (
    <Link {...rest} className={cn(buttonClass(variant, { full, fullMobile, size }), 'no-underline', className)}>
      {children}
      {(chevron ?? variant === 'tertiary') && <ChevronRight aria-hidden size={18} strokeWidth={1.75} />}
    </Link>
  );
}
