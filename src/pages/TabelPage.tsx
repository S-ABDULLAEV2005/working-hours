import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { StatTiles, type Tile } from '../components/StatTiles';
import { Button, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useI18n, type DictKey } from '../i18n';
import { useIsAdmin } from '../lib/auth';
import { useMonthData, type Group, type MonthRow } from '../lib/data';
import { deptLabel, minuteClock } from '../lib/format';
import { useMonthParam } from '../lib/useMonthParam';

type Metric = 'days' | 'worked' | 'late' | 'single' | 'overtime' | 'absences';

const COLS: { key: Metric; label: DictKey }[] = [
  { key: 'days', label: 'col.days' },
  { key: 'worked', label: 'col.worked' },
  { key: 'late', label: 'col.late' },
  { key: 'single', label: 'col.single' },
  { key: 'overtime', label: 'col.overtime' },
  { key: 'absences', label: 'col.absences' },
];

const value = (r: MonthRow, m: Metric) =>
  ({
    days: r.daysPresent,
    worked: r.minutesPresent,
    late: r.noSchedule ? -1 : r.minutesLate,
    single: r.singleEventDays,
    overtime: r.minutesOvertime,
    absences: r.absenceDays,
  })[m];

export function TabelPage() {
  const admin = useIsAdmin();
  const { t, f, tp } = useI18n();
  const { month, setMonth, months } = useMonthParam();
  const { data, error, isLoading, refetch } = useMonthData(month);

  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const [dept, setDept] = useState('');
  const [group, setGroup] = useState<Group>('main');
  const [metric, setMetric] = useState<Metric | null>(null);
  const [exporting, setExporting] = useState(false);

  const inGroup = useMemo(() => (data ? data.rows.filter((r) => r.group === group) : []), [data, group]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { main: 0, low: 0, excluded: 0 };
    data?.rows.forEach((r) => c[r.group]++);
    return c;
  }, [data]);

  const rows = useMemo(() => {
    let r = inGroup;
    if (q) r = r.filter((x) => x.employee.name.toLowerCase().includes(q) || x.employeeId === q);
    if (dept) r = r.filter((x) => x.employee.department === dept);
    if (metric && metric !== 'days' && metric !== 'worked') r = r.filter((x) => value(x, metric) > 0);
    const byName = (a: MonthRow, b: MonthRow) => a.employee.name.localeCompare(b.employee.name, 'ru');
    return [...r].sort(metric ? (a, b) => value(b, metric) - value(a, metric) || byName(a, b) : byName);
  }, [inGroup, q, dept, metric]);

  const sums = useMemo(() => {
    const s = { days: 0, worked: 0, late: 0, lateMin: 0, single: 0, overtime: 0, absences: 0 };
    for (const r of inGroup) {
      s.days += r.daysPresent;
      s.worked += r.minutesPresent;
      s.late += r.lateCount;
      s.lateMin += r.minutesLate;
      s.single += r.singleEventDays;
      s.overtime += r.minutesOvertime;
      s.absences += r.absenceDays;
    }
    return s;
  }, [inGroup]);

  if (months.isLoading) return <SkeletonRows />;
  if (months.error)
    return (
      <Notice tone="error" title={t('common.loadError')}>
        {(months.error as Error).message}
      </Notice>
    );
  if (!month)
    return (
      <EmptyState
        title={t('common.noData')}
        action={
          admin ? (
            <Link to="/upload">
              <Button variant="primary">{t('nav.upload')}</Button>
            </Link>
          ) : undefined
        }
      >
        {admin ? t('tabel.emptyAdmin') : t('tabel.emptyViewer')}
      </EmptyState>
    );

  const tiles: Tile<Metric>[] = [
    { key: 'days', label: t('stat.daysPresentAll'), value: f.num(sums.days) },
    { key: 'worked', label: t('stat.worked'), value: f.hours(sums.worked) },
    {
      key: 'late',
      label: t('stat.lates'),
      value: f.num(sums.late),
      note: sums.late ? f.hours(sums.lateMin) : undefined,
      tone: sums.late ? 'late' : undefined,
    },
    { key: 'single', label: t('stat.singleDays'), value: f.num(sums.single), tone: sums.single ? 'single' : undefined },
    {
      key: 'overtime',
      label: t('stat.overtime'),
      value: f.hours(sums.overtime),
      tone: sums.overtime ? 'stamp' : undefined,
    },
    {
      key: 'absences',
      label: t('stat.absenceDays'),
      value: f.num(sums.absences),
      tone: sums.absences ? 'ok' : undefined,
    },
  ];
  const cols = metric ? COLS.filter((c) => c.key === metric) : COLS;

  const doExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const { exportMonth } = await import('../lib/exportReport');
      await exportMonth(month, data, rows, t, f);
      toast.success(t('export.done'));
    } catch (e) {
      toast.error(t('export.failed'), { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  const groupTabs: { key: Group; label: string; hint?: string }[] = [
    { key: 'main', label: t('tabel.tab.main') },
    {
      key: 'low',
      label: t('tabel.tab.low'),
      hint: data
        ? t('tabel.lowHint', {
            pct: data.settings.lowAttendancePercent,
            days: Math.ceil(data.threshold.minDays),
            workdays: data.threshold.workdays,
          })
        : undefined,
    },
    { key: 'excluded', label: t('tabel.tab.excluded'), hint: t('tabel.excludedHint') },
  ];
  const activeHint = groupTabs.find((g) => g.key === group)?.hint;

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title={t('tabel.title', { month: f.monthLower(month) })}
        aside={
          <>
            <MonthSwitcher month={month} months={months.data ?? []} onChange={setMonth} />
            <Button onClick={doExport} loading={exporting} disabled={!data || rows.length === 0}>
              {!exporting && <Download className="size-4" aria-hidden />}
              {t('export.excel')}
            </Button>
          </>
        }
      >
        {data && t('tabel.subtitle', { time: minuteClock(data.settings.shiftStartMinute) })}
      </PageHeader>

      {error && (
        <div className="mb-6">
          <Notice
            tone="error"
            title={t('common.loadError')}
            action={<Button onClick={() => refetch()}>{t('common.retry')}</Button>}
          >
            {error.message}
          </Notice>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-rule" role="tablist">
        {groupTabs.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={group === g.key}
            onClick={() => setGroup(g.key)}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm',
              group === g.key
                ? 'border-stamp font-medium text-stamp-deep'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {g.label} <span className="ml-1 text-faint">{counts[g.key]}</span>
          </button>
        ))}
      </div>
      {activeHint && <p className="mb-4 text-sm text-muted">{activeHint}</p>}

      {data && (
        <div className="mb-5">
          <StatTiles tiles={tiles} active={metric} onSelect={setMetric} label={t('stat.filterLabel')} />
        </div>
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
            placeholder={t('tabel.search')}
            aria-label={t('tabel.search')}
            className="h-9 w-full rounded-md border border-rule bg-surface pr-3 pl-9 text-sm placeholder:text-faint"
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label={t('tabel.dept')}
          className="h-9 max-w-[240px] rounded-md border border-rule bg-surface px-3 text-sm"
        >
          <option value="">{t('tabel.allDepts')}</option>
          {data?.departments.map((d) => (
            <option key={d} value={d}>
              {deptLabel(d) || t('common.noDept')}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted">
          {rows.length} {tp('employees', rows.length)}
          {metric && (
            <button onClick={() => setMetric(null)} className="ml-3 text-stamp hover:underline">
              {t('stat.reset')}
            </button>
          )}
        </span>
      </div>

      <Panel className="overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={10} />
        ) : rows.length === 0 ? (
          <EmptyState title={t('tabel.nobody')}>{t('tabel.nobodyHint')}</EmptyState>
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
                      {deptLabel(r.employee.department) || t('common.noDept')}, ID {r.employeeId}
                    </span>
                    <span className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                      {cols.map((c) => (
                        <span key={c.key}>
                          <span className="text-muted">{t(c.label)}: </span>
                          <MetricValue r={r} m={c.key} />
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule text-left text-xs text-muted">
                    <th scope="col" className="py-3 pr-4 pl-5 font-medium">
                      {t('col.employee')}
                    </th>
                    {cols.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={clsx('px-4 py-3 text-right font-medium', metric === c.key && 'text-stamp-deep')}
                      >
                        {t(c.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {rows.map((r) => (
                    <Row key={r.employeeId} r={r} cols={cols} month={month} />
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

const Row = memo(function Row({ r, cols, month }: { r: MonthRow; cols: { key: Metric }[]; month: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const href = `/employee/${encodeURIComponent(r.employeeId)}?m=${month}`;
  return (
    <tr onClick={() => navigate(href)} className="group cursor-pointer hover:bg-hover">
      <td className="max-w-[320px] py-3 pr-4 pl-5">
        <Link
          to={href}
          onClick={(e) => e.stopPropagation()}
          className="block truncate font-medium group-hover:text-stamp-deep"
        >
          {r.employee.name}
        </Link>
        <span className="block truncate text-xs text-muted">
          {deptLabel(r.employee.department) || t('common.noDept')}, ID {r.employeeId}
        </span>
      </td>
      {cols.map((c) => (
        <td key={c.key} className="px-4 py-3 text-right whitespace-nowrap">
          <MetricValue r={r} m={c.key} />
        </td>
      ))}
    </tr>
  );
});

function MetricValue({ r, m }: { r: MonthRow; m: Metric }) {
  const { t, f } = useI18n();
  switch (m) {
    case 'days':
      return <>{r.daysPresent}</>;
    case 'worked':
      return <>{f.hm(r.minutesPresent)}</>;
    case 'late':
      if (r.noSchedule) return <span className="text-xs text-muted">{t('common.noSchedule')}</span>;
      return r.lateCount ? (
        <span className="text-late">
          <span className="font-semibold">{r.lateCount}</span> · {f.hm(r.minutesLate)}
        </span>
      ) : (
        <span className="text-faint">0</span>
      );
    case 'single':
      return r.singleEventDays ? (
        <span className="font-medium text-single">{r.singleEventDays}</span>
      ) : (
        <span className="text-faint">0</span>
      );
    case 'overtime':
      return r.minutesOvertime ? (
        <span className="font-medium text-stamp">{f.hm(r.minutesOvertime)}</span>
      ) : (
        <span className="text-faint">0</span>
      );
    case 'absences':
      return r.absenceDays ? (
        <span className="font-medium text-ok">{r.absenceDays}</span>
      ) : (
        <span className="text-faint">0</span>
      );
  }
}
