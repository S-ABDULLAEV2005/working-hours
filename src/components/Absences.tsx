import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { FileText, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { Absence } from '../core';
import { useErrorText, useI18n } from '../i18n';
import { useApi, useAuth } from '../lib/auth';
import { dateShort, minuteClock, parseClock, todayIso } from '../lib/format';
import { Button } from './ui';

export function Modal({
  open,
  onClose,
  title,
  children,
  locked,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  locked?: boolean;
  wide?: boolean;
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
      onCancel={(e) => locked && e.preventDefault()}
      className={clsx(
        'm-auto max-h-[calc(100dvh-2rem)] rounded-xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30',
        wide ? 'w-[min(720px,calc(100vw-2rem))]' : 'w-[min(480px,calc(100vw-2rem))]',
      )}
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {!locked && (
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-hover" aria-label={t('common.close')}>
              <X className="size-4" />
            </button>
          )}
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

/** Форма отгула: сотрудник отмечает сам, прикладывая подтверждение руководителя. */
export function AbsenceForm({
  open,
  onClose,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId?: string;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { t } = useI18n();
  const errText = useErrorText();
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('12:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setFrom('08:00');
      setTo('12:00');
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const f = parseClock(from);
    const tt = parseClock(to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(t('abs.errDate'));
    if (f === null || tt === null) return setError(t('abs.errTime'));
    if (tt <= f) return setError(t('err.timeOrder'));
    if (reason.trim().length < 3) return setError(t('err.reasonRequired'));
    setSaving(true);
    try {
      await api.createAbsence({ date, fromMinute: f, toMinute: tt, reason, file: null, employeeId });
      await qc.invalidateQueries({ queryKey: ['absences'] });
      toast.success(t('abs.saved'));
      onClose();
    } catch (err) {
      setError(errText(err));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule bg-surface px-3';
  return (
    <Modal open={open} onClose={onClose} title={t('abs.formTitle')} locked={saving}>
      <form onSubmit={submit} noValidate>
        <p className="mb-4 rounded-lg bg-stamp-soft px-3 py-2 text-sm text-stamp-deep">{t('abs.formHint')}</p>
        <label className="block text-sm font-medium" htmlFor="ab-date">
          {t('abs.date')}
        </label>
        <input id="ab-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            {t('abs.from')}
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value.replace(/[^\d:]/g, ''))}
              inputMode="numeric"
              maxLength={5}
              placeholder="08:00"
              className={field}
            />
          </label>
          <label className="text-sm font-medium">
            {t('abs.to')}
            <input
              value={to}
              onChange={(e) => setTo(e.target.value.replace(/[^\d:]/g, ''))}
              inputMode="numeric"
              maxLength={5}
              placeholder="12:00"
              className={field}
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">{t('abs.fullDayHint')}</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="ab-reason">
          {t('abs.reason')}
        </label>
        <textarea
          id="ab-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t('abs.reasonPlaceholder')}
          className="mt-1.5 w-full rounded-md border border-rule bg-surface px-3 py-2"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-late">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t('abs.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function StatusBadge({ status }: { status: Absence['status'] }) {
  const { t } = useI18n();
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'new' && 'bg-single-soft text-[#8a5d00]',
        status === 'checked' && 'bg-ok-soft text-ok',
        status === 'rejected' && 'bg-late-soft text-late',
      )}
    >
      {t(`abs.status.${status}`)}
    </span>
  );
}

export function AttachmentButton({ path }: { path: string | null }) {
  const api = useApi();
  const { t } = useI18n();
  const errText = useErrorText();
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const url = await api.attachmentUrl(path);
          window.open(url, '_blank', 'noopener');
        } catch (e) {
          toast.error(errText(e));
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm text-stamp underline-offset-2 hover:underline disabled:opacity-60"
    >
      <FileText className="size-4" aria-hidden /> {t('abs.openFile')}
    </button>
  );
}

/** Строка отгула в списке сотрудника. */
export function AbsenceRow({ a, canDelete }: { a: Absence; canDelete: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const { profile } = useAuth();
  const remove = async () => {
    try {
      await api.deleteAbsence(a.id);
      await qc.invalidateQueries({ queryKey: ['absences'] });
      toast.success(t('abs.deleted'));
    } catch (e) {
      toast.error(errText(e));
    }
  };
  return (
    <li className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_1fr_auto] sm:items-start">
      <div>
        <p className="font-medium">{f.dayLong(a.date)}</p>
        <p className="text-sm text-muted">
          {minuteClock(a.fromMinute)}–{minuteClock(a.toMinute)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm break-words">{a.reason}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <StatusBadge status={a.status} />
          <AttachmentButton path={a.attachmentPath} />
        </div>
        {a.status === 'rejected' && a.reviewNote && (
          <p className="mt-1 text-sm text-late">
            {t('abs.rejectedBecause')}: {a.reviewNote}
            {a.reviewedByName && <span className="text-muted"> ({a.reviewedByName})</span>}
          </p>
        )}
      </div>
      {canDelete && (a.status === 'new' || profile?.role === 'admin') && (
        <Button variant="ghost" onClick={remove} aria-label={t('abs.delete')}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}

export { dateShort };
