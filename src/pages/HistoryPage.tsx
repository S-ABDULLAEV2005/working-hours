import { useState } from 'react';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useApi } from '../lib/auth';
import { useMonths, useUploads } from '../lib/data';
import { dateShort, dateTime, monthTitle, plural } from '../lib/format';

export function HistoryPage() {
  const api = useApi();
  const qc = useQueryClient();
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
      toast.success(`${monthTitle(toDelete)} удалён`, { description: `Удалено записей: ${n}.` });
      setToDelete(null);
    } catch (e) {
      toast.error('Не удалось удалить', { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="История загрузок"
        aside={
          <Link to="/upload">
            <Button variant="primary">Загрузить файл</Button>
          </Link>
        }
      />

      <h2 className="mb-3 font-semibold">Месяцы в базе</h2>
      <Panel className="mb-8 overflow-hidden">
        {months.isLoading ? (
          <SkeletonRows rows={3} />
        ) : months.error ? (
          <div className="p-4">
            <Notice tone="error" title="Не удалось загрузить">
              {(months.error as Error).message}
            </Notice>
          </div>
        ) : !months.data?.length ? (
          <EmptyState title="В базе пока нет данных" />
        ) : (
          <ul className="divide-y divide-rule">
            {months.data.map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-4 px-5 py-3">
                <Link to={`/?m=${m.month}`} className="font-medium hover:text-stamp-deep">
                  {monthTitle(m.month)}
                </Link>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted">
                    {m.days.toLocaleString('ru-RU')} {plural(m.days, 'запись', 'записи', 'записей')}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => setToDelete(m.month)}
                    aria-label={`Удалить ${monthTitle(m.month)}`}
                  >
                    <Trash2 className="size-4" aria-hidden /> Удалить
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <h2 className="mb-3 font-semibold">Загруженные файлы</h2>
      <Panel className="overflow-hidden">
        {uploads.isLoading ? (
          <SkeletonRows rows={4} />
        ) : uploads.error ? (
          <div className="p-4">
            <Notice tone="error" title="Не удалось загрузить">
              {(uploads.error as Error).message}
            </Notice>
          </div>
        ) : !uploads.data?.length ? (
          <EmptyState title="Файлы ещё не загружались" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Когда</th>
                  <th className="px-3 py-3 font-medium">Файл</th>
                  <th className="px-3 py-3 font-medium">Период</th>
                  <th className="px-3 py-3 text-right font-medium">Сотрудников</th>
                  <th className="px-3 py-3 text-right font-medium">Пропущено строк</th>
                  <th className="px-5 py-3 font-medium">Кто загрузил</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {uploads.data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{dateTime(u.createdAt)}</td>
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
        title={toDelete ? `Удалить ${monthTitle(toDelete).toLowerCase()}?` : ''}
        confirmLabel="Удалить месяц"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => !deleting && setToDelete(null)}
      >
        Все данные о приходе и уходе за этот месяц будут удалены. Восстановить их можно, только загрузив файл FaceID
        заново.
      </ConfirmDialog>
    </div>
  );
}
