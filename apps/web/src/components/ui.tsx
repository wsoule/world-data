import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export { clsx as cx };

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        variant === 'primary' && 'bg-accent-600 text-white hover:bg-accent-700',
        variant === 'secondary' &&
          'border border-app bg-surface hover:bg-surface-2',
        variant === 'ghost' && 'hover:bg-surface-2',
        variant === 'danger' && 'text-bad hover:bg-surface-2',
        className
      )}
    />
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'bad';
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'accent' &&
          'bg-accent-100 text-accent-800 dark:bg-accent-900/50 dark:text-accent-200',
        tone === 'good' &&
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
        tone === 'bad' &&
          'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  title,
  actions,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={clsx('card', className)}>
      {title != null || actions != null ? (
        <header className="border-app flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title != null ? (
              <h2 className="text-sm font-semibold">{title}</h2>
            ) : null}
            {subtitle != null ? (
              <p className="text-muted mt-0.5 text-xs">{subtitle}</p>
            ) : null}
          </div>
          {actions != null ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={clsx(
        'inline-flex flex-wrap rounded-lg border border-app bg-surface-2 p-0.5',
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
            o.value === value
              ? 'bg-surface text-app shadow-sm'
              : 'text-muted hover:text-app'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={clsx(
        'rounded-lg border border-app bg-surface px-2 py-1.5 text-sm',
        className
      )}
      value={String(value)}
      onChange={(e) => {
        const opt = options.find((o) => String(o.value) === e.target.value);
        if (opt != null) onChange(opt.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx('rounded-xl border border-app bg-surface p-3', className)}
    >
      <div className="text-muted text-xs">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold">{value}</div>
      {hint != null ? (
        <div className="text-muted mt-0.5 text-xs">{hint}</div>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow != null ? (
          <div className="text-accent-600 dark:text-accent-300 mb-1 text-xs font-medium tracking-wide uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {subtitle != null ? (
          <div className="text-muted mt-1 text-sm">{subtitle}</div>
        ) : null}
      </div>
      {actions != null ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
