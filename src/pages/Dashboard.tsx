import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { ArrowDownUp, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { TabelHeader, TabelLegend, TabelStrip, monthDates } from '../components/Tabel';
import { useIsAdmin } from '../lib/auth';
import { useMonthData, type MonthRow } from '../lib/data';
import type { Settings } from '../core';
import { deptLabel, hm, minuteClock, monthTitle, plural } from '../lib/format';
import { todayIso, useMonthParam } from '../lib/useMonthParam';

type Filter = 'all' | 'late' | 'single';
type Sort = 'name' | 'late' | 'present' | 'lateCount';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'name', label: 'По фамилии' },
  { value: 'late', label: 'Больше всего опозданий (время)' },
  { value: 'lateCount', label: 'Больше всего опозданий (раз)' },
  { value: 'present', label: 'Меньше всего отработано' },
];

export function Dashboard() {
  const admin = useIsAdmin();
  const { month, setMonth, months } = useMonthParam();
  const { data, error, isLoading, refetch } = useMonthData(month);

  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const [dept, setDept] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (q) r = r.filter((x) => x.employee.name.toLowerCase().includes(q) || x.employeeId === q);
    if (dept) r = r.filter((x) => x.employee.department === dept);
    if (filter === 'late') r = r.filter((x) => x.lateCount > 0);
    if (filter === 'single') r = r.filter((x) => x.singleEventDays > 0);
    const byName = (a: MonthRow, b: MonthRow) => a.employee.name.localeCompare(b.employee.name, 'ru');
    const cmp: Record<Sort, (a: MonthRow, b: MonthRow) => number> = {
      name: byName,
      late: (a, b) => b.minutesLate - a.minutesLate || byName(a, b),
      lateCount: (a, b) => b.lateCount - a.lateCount || byName(a, b),
      present: (a, b) => a.minutesPresent - b.minutesPresent || byName(a, b),
    };
    return [...r].sort(cmp[sort]);
  }, [data, q, dept, filter, sort]);

  const totals = useMemo(() => {
    const t = { present: 0, late: 0, lateCount: 0, single: 0 };
    for (const r of rows) {
      t.present += r.minutesPresent;
      t.late += r.minutesLate;
      t.lateCount += r.lateCount;
      t.single += r.singleEventDays;
    }
    return t;
  }, [rows]);

  if (months.isLoading) return <SkeletonRows />;
  if (months.error)
    return (
      <Notice tone="error" title="Не удалось загрузить список месяцев">
        {(months.error as Error).message}
      </Notice>
    );
  if (!month)
    return (
      <EmptyState
        title="Данных пока нет"
        action={
          admin ? (
            <Link to="/upload">
              <Button variant="primary">Загрузить файл FaceID</Button>
            </Link>
          ) : undefined
        }
      >
        {admin
          ? 'Загрузите выгрузку из системы камер — табель появится здесь.'
          : 'Администратор ещё не загрузил ни одного файла. Загляните позже.'}
      </EmptyState>
    );

  const dates = monthDates(month);
  const today = todayIso();
  const filtered = !!(q || dept || filter !== 'all');

  const doExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { exportMonth } = await import('../lib/exportReport');
      await exportMonth(month, data, rows);
      toast.success('Отчёт скачан');
    } catch (e) {
      toast.error('Не удалось сформировать отчёт', { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={monthTitle(month)}
        aside={
          <>
            <MonthSwitcher month={month} months={months.data ?? []} onChange={setMonth} />
            <Button onClick={doExport} loading={exporting} disabled={!data || rows.length === 0}>
              {!exporting && <Download className="size-4" aria-hidden />}
              Скачать Excel
            </Button>
          </>
        }
      >
        {data && (
          <>
            Рабочий день с {minuteClock(data.settings.shiftStartMinute)}. Время прихода и ухода — по первой и последней
            отметке камер за день.
          </>
        )}
      </PageHeader>

      {error && (
        <div className="mb-6">
          <Notice
            tone="error"
            title="Не удалось загрузить данные"
            action={<Button onClick={() => refetch()}>Повторить</Button>}
          >
            {error.message}
          </Notice>
        </div>
      )}

      {data && (
        <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-rule py-5 sm:grid-cols-4">
          <Figure
            label={filtered ? 'сотрудников по фильтру' : plural(rows.length, 'сотрудник', 'сотрудника', 'сотрудников')}
            value={rows.length.toLocaleString('ru-RU')}
          />
          <Figure label="отработано всего" value={`${Math.floor(totals.present / 60).toLocaleString('ru-RU')} ч`} />
          <Figure
            label={plural(totals.lateCount, 'опоздание', 'опоздания', 'опозданий')}
            value={totals.lateCount.toLocaleString('ru-RU')}
            tone={totals.lateCount ? 'late' : undefined}
          />
          <Figure
            label="дней без отметки ухода"
            value={totals.single.toLocaleString('ru-RU')}
            tone={totals.single ? 'single' : undefined}
          />
        </dl>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ФИО или ID"
            aria-label="Поиск по ФИО или ID"
            className="h-9 w-full rounded-md border border-rule bg-surface pr-3 pl-9 text-sm placeholder:text-faint"
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="Отдел"
          className="h-9 max-w-[220px] rounded-md border border-rule bg-surface px-3 text-sm"
        >
          <option value="">Все отделы</option>
          {data?.departments.map((d) => (
            <option key={d} value={d}>
              {deptLabel(d)}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-rule bg-surface p-0.5" role="group" aria-label="Фильтр">
          {(
            [
              ['all', 'Все'],
              ['late', 'С опозданиями'],
              ['single', 'Без отметки ухода'],
            ] as [Filter, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              aria-pressed={filter === v}
              className={clsx(
                'h-8 rounded px-3 text-sm whitespace-nowrap',
                filter === v ? 'bg-stamp-soft font-medium text-stamp-deep' : 'text-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <ArrowDownUp className="size-4" aria-hidden />
          <span className="sr-only">Сортировка</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-md border border-rule bg-surface px-2 text-sm text-ink"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4">
        <TabelLegend />
      </div>

      <Panel className="overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={10} />
        ) : rows.length === 0 ? (
          <EmptyState title={filtered ? 'Никого не найдено' : 'За этот месяц данных нет'}>
            {filtered
              ? 'Измените поиск или фильтры.'
              : admin
                ? 'Загрузите файл FaceID, в котором есть этот месяц.'
                : 'Администратор ещё не загрузил этот месяц.'}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-rule md:hidden">
              {rows.map((r) => (
                <li key={r.employeeId}>
                  <Link
                    to={`/employee/${encodeURIComponent(r.employeeId)}?m=${month}`}
                    className="block px-4 py-3 active:bg-hover"
                  >
                    <span className="block font-medium">{r.employee.name}</span>
                    <span className="block text-xs text-muted">
                      {deptLabel(r.employee.department)}, ID {r.employeeId}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                      <span>{r.daysPresent} дн.</span>
                      <span>{hm(r.minutesPresent)}</span>
                      {r.noSchedule ? (
                        <span className="text-muted">нет графика</span>
                      ) : (
                        <span className={r.lateCount ? 'text-late' : 'text-faint'}>
                          опозданий {r.lateCount}
                          {r.lateCount ? `, ${hm(r.minutesLate)}` : ''}
                        </span>
                      )}
                      {r.singleEventDays > 0 && <span className="text-single">без ухода {r.singleEventDays}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-xs text-muted">
                    <th scope="col" className="py-3 pr-4 pl-5 font-medium">
                      Сотрудник
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      <span className="sr-only">Табель по дням</span>
                      {data && <TabelHeader dates={dates} settings={data.settings} />}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Дней
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Отработано
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Опоздания
                    </th>
                    <th scope="col" className="py-3 pr-5 pl-3 text-right font-medium">
                      Без ухода
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {rows.map((r) => (
                    <EmployeeRow
                      key={r.employeeId}
                      row={r}
                      dates={dates}
                      today={today}
                      month={month}
                      settings={data!.settings}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

const EmployeeRow = memo(function EmployeeRow({
  row,
  dates,
  today,
  month,
  settings,
}: {
  row: MonthRow;
  dates: string[];
  today: string;
  month: string;
  settings: Settings;
}) {
  const navigate = useNavigate();
  const byDate = new Map(row.days.map((d) => [d.date, d]));
  return (
    <tr
      onClick={() => navigate(`/employee/${encodeURIComponent(row.employeeId)}?m=${month}`)}
      className="group cursor-pointer hover:bg-hover"
    >
      <td className="max-w-[280px] py-3 pr-4 pl-5">
        <Link
          to={`/employee/${encodeURIComponent(row.employeeId)}?m=${month}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate font-medium group-hover:text-stamp-deep"
        >
          {row.employee.name}
        </Link>
        <span className="block truncate text-xs text-muted">
          {deptLabel(row.employee.department)}, ID {row.employeeId}
        </span>
      </td>
      <td className="px-3 py-3">
        <TabelStrip dates={dates} byDate={byDate} settings={settings} today={today} />
      </td>
      <td className="px-3 py-3 text-right">{row.daysPresent}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap">{hm(row.minutesPresent)}</td>
      <td className="px-3 py-3 text-right whitespace-nowrap">
        {row.noSchedule ? (
          <span className="text-xs text-muted">нет графика</span>
        ) : row.lateCount ? (
          <span className="text-late">
            <span className="font-semibold">{row.lateCount}</span>
            <span className="text-late/80"> × {hm(row.minutesLate)}</span>
          </span>
        ) : (
          <span className="text-faint">0</span>
        )}
      </td>
      <td className="py-3 pr-5 pl-3 text-right">
        {row.singleEventDays ? (
          <span className="font-medium text-single">{row.singleEventDays}</span>
        ) : (
          <span className="text-faint">0</span>
        )}
      </td>
    </tr>
  );
});

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'late' | 'single' }) {
  return (
    <div>
      <dd
        className={clsx(
          'text-2xl font-semibold tracking-tight',
          tone === 'late' && 'text-late',
          tone === 'single' && 'text-single',
        )}
      >
        {value}
      </dd>
      <dt className="text-sm text-muted">{label}</dt>
    </div>
  );
}
