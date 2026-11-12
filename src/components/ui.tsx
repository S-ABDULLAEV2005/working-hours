import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useI18n } from '../i18n';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary' && 'bg-stamp text-white hover:bg-stamp-deep',
        variant === 'secondary' && 'border border-rule bg-surface text-ink hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-ink',
        variant === 'danger' && 'bg-late text-white hover:brightness-95',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  label ??= t('common.loading');
  return (
    <div role="status" className="flex items-center gap-2 py-16 text-sm text-muted justify-center">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-rule" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 px-5 py-4">
          <div className="h-3.5 w-48 animate-pulse rounded bg-rule" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-hover" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-rule" />
        </div>
      ))}
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'ok';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={clsx(
        'rounded-lg border-l-4 px-4 py-3',
        tone === 'info' && 'border-stamp bg-stamp-soft',
        tone === 'warn' && 'border-single bg-single-soft',
        tone === 'error' && 'border-late bg-late-soft',
        tone === 'ok' && 'border-ok bg-ok-soft',
      )}
    >
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-ink/80">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="mt-2 text-sm text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (loading) e.preventDefault();
      }}
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 text-muted hover:bg-hover"
            aria-label={t('common.close')}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function PageHeader({ title, children, aside }: { title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">{title}</h1>
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('rounded-xl border border-rule bg-surface', className)}>{children}</section>;
}
