import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Absence, AbsenceStatus } from '../core';
import { AttachmentButton, Modal, StatusBadge } from '../components/Absences';
import { Button, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { useApi, useCanReview } from '../lib/auth';
import { useEmployees } from '../lib/data';
import { deptLabel, minuteClock, todayIso } from '../lib/format';

type Tab = AbsenceStatus | 'all';

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Отгулы для проверки руководителем: засчитаны сразу, но любой можно отклонить. */
export function AbsencesPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const canReview = useCanReview();
  const emps = useEmployees();
  const [tab, setTab] = useState<Tab>('new');
  const [rejecting, setRejecting] = useState<Absence | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ['absences', 'review'],
    queryFn: () => api.listAbsences(daysAgo(180), daysAgo(-60)),
  });

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { new: 0, checked: 0, rejected: 0, all: 0 };
    for (const a of list.data ?? []) {
      c[a.status]++;
      c.all++;
    }
    return c;
  }, [list.data]);
  const shown = (list.data ?? []).filter((a) => tab === 'all' || a.status === tab);

  const review = async (a: Absence, status: AbsenceStatus, n = '') => {
    setBusy(a.id);
    try {
      await api.reviewAbsence(a.id, status, n);
      await qc.invalidateQueries({ queryKey: ['absences'] });
      toast.success(status === 'checked' ? t('rev.checkedToast') : t('rev.rejectedToast'));
      setRejecting(null);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'new', label: t('rev.tab.new') },
    { key: 'checked', label: t('rev.tab.checked') },
    { key: 'rejected', label: t('rev.tab.rejected') },
    { key: 'all', label: t('rev.tab.all') },
  ];

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader title={t('nav.absences')}>{t('rev.subtitle')}</PageHeader>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-rule" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm',
              tab === x.key
                ? 'border-stamp font-medium text-stamp-deep'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {x.label} <span className="ml-1 text-faint">{counts[x.key]}</span>
          </button>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {list.isLoading ? (
          <SkeletonRows rows={4} />
        ) : list.error ? (
          <div className="p-5">
            <Notice tone="error" title={t('common.loadError')}>
              {errText(list.error)}
            </Notice>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title={tab === 'new' ? t('rev.noneNew') : t('abs.none')} />
        ) : (
          <ul className="divide-y divide-rule">
            {shown.map((a) => {
              const e = emps.data?.get(a.employeeId);
              const future = a.date > todayIso();
              return (
                <li key={a.id} className="grid gap-3 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-start">
                  <div className="min-w-0">
                    <Link
                      to={`/employee/${encodeURIComponent(a.employeeId)}?m=${a.date.slice(0, 7)}`}
                      className="block truncate font-medium hover:text-stamp-deep"
                    >
                      {e?.name ?? `ID ${a.employeeId}`}
                    </Link>
                    <span className="block truncate text-xs text-muted">
                      {e ? deptLabel(e.department) || t('common.noDept') : ''}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{f.dayLong(a.date)}</span>, {minuteClock(a.fromMinute)}–
                      {minuteClock(a.toMinute)}
                      {future && <span className="ml-2 text-xs text-muted">{t('rev.future')}</span>}
                    </p>
                    <p className="mt-0.5 text-sm break-words">{a.reason}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <StatusBadge status={a.status} />
                      <AttachmentButton path={a.attachmentPath} />
                      <span className="text-xs text-faint">{t('rev.created', { date: f.dateTime(a.createdAt) })}</span>
                    </div>
                    {a.status !== 'new' && a.reviewedByName && (
                      <p className="mt-1 text-xs text-muted">
                        {a.reviewedByName}
                        {a.reviewNote && `: ${a.reviewNote}`}
                      </p>
                    )}
                  </div>
                  {canReview && (
                    <div className="flex gap-2 md:justify-end">
                      {a.status !== 'checked' && (
                        <Button onClick={() => review(a, 'checked')} loading={busy === a.id} disabled={busy !== null}>
                          <Check className="size-4 text-ok" aria-hidden /> {t('rev.check')}
                        </Button>
                      )}
                      {a.status !== 'rejected' && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setNote('');
                            setRejecting(a);
                          }}
                          disabled={busy !== null}
                        >
                          <X className="size-4 text-late" aria-hidden /> {t('rev.reject')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-sm text-muted">{t('rev.footnote')}</p>

      <Modal
        open={!!rejecting}
        onClose={() => busy === null && setRejecting(null)}
        title={t('rev.rejectTitle')}
        locked={busy !== null}
      >
        <p className="text-sm text-muted">{t('rev.rejectExplain')}</p>
        <label className="mt-4 block text-sm font-medium">
          {t('rev.rejectReason')}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('rev.rejectPlaceholder')}
            className="mt-1.5 h-10 w-full rounded-md border border-rule px-3"
            autoFocus
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setRejecting(null)} disabled={busy !== null}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => rejecting && review(rejecting, 'rejected', note.trim())}
            loading={busy !== null}
            disabled={note.trim().length < 3}
          >
            {t('rev.reject')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
