import { useState } from 'react';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { useApi } from '../lib/auth';
import { useMonths, useUploads } from '../lib/data';
import { dateShort } from '../lib/format';

export function HistoryPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const uploads = useUploads();
  const months = useMonths();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const n = await api.deleteMonth(toDelete);
      await qc.invalidateQueries();
      toast.success(t('hist.deleted', { month: f.monthTitle(toDelete) }), {
        description: t('hist.deletedRows', { n }),
      });
      setToDelete(null);
    } catch (e) {
      toast.error(t('hist.deleteFailed'), { description: errText(e) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title={t('nav.history')}
        aside={
          <Link to="/upload">
            <Button variant="primary">{t('nav.upload')}</Button>
          </Link>
        }
      />

      <h2 className="mb-3 font-semibold">{t('hist.months')}</h2>
      <Panel className="mb-8 overflow-hidden">
        {months.isLoading ? (
          <SkeletonRows rows={3} />
        ) : months.error ? (
          <div className="p-4">
            <Notice tone="error" title={t('common.loadError')}>
              {errText(months.error)}
            </Notice>
          </div>
        ) : !months.data?.length ? (
          <EmptyState title={t('common.noData')} />
        ) : (
          <ul className="divide-y divide-rule">
            {months.data.map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-4 px-5 py-3">
                <Link to={`/tabel?m=${m.month}`} className="font-medium hover:text-stamp-deep">
                  {f.monthTitle(m.month)}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted">{t('hist.records', { n: f.num(m.days) })}</span>
                  <Button
                    variant="ghost"
                    onClick={() => setToDelete(m.month)}
                    aria-label={`${t('hist.delete')} ${f.monthTitle(m.month)}`}
                  >
                    <Trash2 className="size-4" aria-hidden /> {t('hist.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <h2 className="mb-3 font-semibold">{t('hist.files')}</h2>
      <Panel className="overflow-hidden">
        {uploads.isLoading ? (
          <SkeletonRows rows={4} />
        ) : uploads.error ? (
          <div className="p-4">
            <Notice tone="error" title={t('common.loadError')}>
              {errText(uploads.error)}
            </Notice>
          </div>
        ) : !uploads.data?.length ? (
          <EmptyState title={t('hist.noFiles')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">{t('hist.when')}</th>
                  <th className="px-3 py-3 font-medium">{t('hist.file')}</th>
                  <th className="px-3 py-3 font-medium">{t('up.period')}</th>
                  <th className="px-3 py-3 text-right font-medium">{t('up.employees')}</th>
                  <th className="px-3 py-3 text-right font-medium">{t('hist.skipped')}</th>
                  <th className="px-5 py-3 font-medium">{t('hist.who')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {uploads.data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{f.dateTime(u.createdAt)}</td>
                    <td className="max-w-[240px] truncate px-3 py-3" title={u.fileName}>
                      {u.fileName}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {dateShort(u.periodFrom)} – {dateShort(u.periodTo)}
                    </td>
                    <td className="px-3 py-3 text-right">{u.employeesTotal}</td>
                    <td className="px-3 py-3 text-right">{u.issuesTotal || <span className="text-faint">0</span>}</td>
                    <td className="px-5 py-3">{u.uploadedByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? t('hist.deleteTitle', { month: f.monthLower(toDelete) }) : ''}
        confirmLabel={t('hist.deleteConfirm')}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => !deleting && setToDelete(null)}
      >
        {t('hist.deleteHint')}
      </ConfirmDialog>
    </div>
  );
}
