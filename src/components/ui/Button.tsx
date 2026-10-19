import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'inverse' | 'ghost-inverse';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[10px] text-[15px] leading-[18px] font-semibold select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 whitespace-nowrap';

const variants: Record<ButtonVariant, string> = {
  primary: 'min-h-11 px-5 py-3 bg-primary text-on-primary shadow-[0_1px_2px_rgba(16,24,40,0.12),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-primary-deep active:bg-primary-deep hover:text-on-primary',
  secondary: 'min-h-11 px-4 py-3 bg-canvas text-ink border border-[#cfd6e1] shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-chrome hover:border-hairline hover:text-ink active:bg-band',
  tertiary: 'min-h-11 px-1 text-primary hover:text-primary-deep hover:underline active:translate-y-0',
  destructive: 'min-h-11 px-4 py-3 bg-canvas text-error border border-[#f0b4ba] hover:bg-error-bg hover:text-error',
  /** For dark bands. */
  inverse: 'min-h-11 px-5 py-3 bg-white text-ink hover:bg-[#e8eefc] hover:text-ink',
  'ghost-inverse': 'min-h-11 px-4 py-3 border border-white/30 text-white hover:bg-white/10 hover:text-white',
};

export function buttonClass(variant: ButtonVariant = 'primary', opts: { full?: boolean; fullMobile?: boolean; size?: 'md' | 'sm' } = {}) {
  return cn(
    base,
    variants[variant],
    opts.full && 'w-full',
    opts.fullMobile && 'w-full md:w-auto',
    opts.size === 'sm' && variant !== 'tertiary' && 'min-h-9 px-3 py-2 text-[14px]',
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
