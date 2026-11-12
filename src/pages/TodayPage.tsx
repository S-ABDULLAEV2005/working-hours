import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { isWorkday, isoWeekday, validAbsences, type Absence, type DailyRecord } from '../core';
import { EmptyState, Notice, Panel, SkeletonRows } from '../components/ui';
import { useI18n, type DictKey } from '../i18n';
import { useCanReview } from '../lib/auth';
import { useLatestDate, useMonthData, type MonthRow } from '../lib/data';
import { deptLabel, minuteClock, secClock } from '../lib/format';

type Bucket = 'present' | 'onTime' | 'late' | 'absent' | 'leave';

const shiftDay = (d: string, delta: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + delta);
  return x.toISOString().slice(0, 10);
};

interface Item {
  row: MonthRow;
  rec?: DailyRecord;
  abs: Absence[];
}

/** Главный экран руководителя: что происходит в выбранный день. */
export function TodayPage() {
  const { t, f, tp } = useI18n();
  const canReview = useCanReview();
  const latest = useLatestDate();
  const [params, setParams] = useSearchParams();
  const urlDay = params.get('d');
  const day = urlDay && /^\d{4}-\d{2}-\d{2}$/.test(urlDay) ? urlDay : (latest.data ?? undefined);
  const month = day?.slice(0, 7);
  const { data, error, isLoading } = useMonthData(month);
  const [bucket, setBucket] = useState<Bucket>('late');

  const setDay = (d: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('d', d);
      return n;
    });

  const buckets = useMemo(() => {
    const b: Record<Bucket, Item[]> = { present: [], onTime: [], late: [], absent: [], leave: [] };
    if (!data || !day) return b;
    const s = data.settings;
    const workday = isWorkday(day, s);
    for (const row of data.rows) {
      if (row.group === 'excluded') continue;
      const rec = row.days.find((d) => d.date === day);
      const abs = validAbsences(row.absences.filter((a) => a.date === day));
      const item = { row, rec, abs };
      if (abs.length) b.leave.push(item);
      if (rec) {
        b.present.push(item);
        if (!row.noSchedule && workday) {
          if (rec.minutesLate) b.late.push(item);
          else if (Math.floor(rec.firstIn / 60) <= s.shiftStartMinute || rec.minutesLate === 0) b.onTime.push(item);
        }
      } else if (workday && !row.noSchedule && row.group === 'main' && !abs.length) {
        b.absent.push(item);
      }
    }
    const byName = (a: Item, c: Item) => a.row.employee.name.localeCompare(c.row.employee.name, 'ru');
    b.late.sort((a, c) => (c.rec?.minutesLate ?? 0) - (a.rec?.minutesLate ?? 0) || byName(a, c));
    b.onTime.sort((a, c) => (a.rec?.firstIn ?? 0) - (c.rec?.firstIn ?? 0));
    b.present.sort((a, c) => (a.rec?.firstIn ?? 0) - (c.rec?.firstIn ?? 0));
    b.absent.sort(byName);
    b.leave.sort(byName);
    return b;
  }, [data, day]);

  const overtimeTop = useMemo(
    () =>
      data
        ? data.rows
            .filter((r) => r.group !== 'excluded' && r.minutesOvertime > 0)
            .sort((a, b) => b.minutesOvertime - a.minutesOvertime)
            .slice(0, 8)
        : [],
    [data],
  );
  const pending = data ? data.absences.filter((a) => a.status === 'new').length : 0;

  if (latest.isLoading) return <SkeletonRows />;
  if (latest.error)
    return (
      <Notice tone="error" title={t('common.loadError')}>
        {(latest.error as Error).message}
      </Notice>
    );
  if (!day) return <EmptyState title={t('common.noData')}>{t('today.noData')}</EmptyState>;

  const s = data?.settings;
  const workday = s ? isWorkday(day, s) : true;
  const isLatest = day === latest.data;
  const cards: { key: Bucket; label: DictKey; tone: string }[] = [
    { key: 'present', label: 'today.present', tone: 'text-stamp' },
    { key: 'onTime', label: 'today.onTime', tone: 'text-ok' },
    { key: 'late', label: 'today.late', tone: 'text-late' },
    { key: 'absent', label: 'today.absent', tone: 'text-ink' },
    { key: 'leave', label: 'today.leave', tone: 'text-ok' },
  ];
  const list = buckets[bucket];

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{isLatest ? t('today.latestData') : t('today.selectedDay')}</p>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em]">
            {f.dayLong(day)}, {f.weekday(isoWeekday(day))}
          </h1>
          {!workday && <p className="mt-1 text-sm font-medium text-single">{t('today.dayOff')}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="grid size-9 place-items-center rounded-md border border-rule bg-surface text-muted hover:bg-hover"
            onClick={() => setDay(shiftDay(day, -1))}
            aria-label={t('today.prevDay')}
          >
            <ChevronLeft className="size-4" />
          </button>
          <input
            type="date"
            value={day}
            max={latest.data ?? undefined}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            aria-label={t('today.pickDay')}
            className="h-9 rounded-md border border-rule bg-surface px-3 text-sm"
          />
          <button
            className="grid size-9 place-items-center rounded-md border border-rule bg-surface text-muted hover:bg-hover disabled:opacity-35"
            onClick={() => setDay(shiftDay(day, 1))}
            disabled={!!latest.data && day >= latest.data}
            aria-label={t('today.nextDay')}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {error && (
        <Notice tone="error" title={t('common.loadError')}>
          {error.message}
        </Notice>
      )}

      {canReview && pending > 0 && (
        <Link
          to="/absences"
          className="mb-6 flex items-center gap-3 rounded-xl border border-single/50 bg-single-soft px-5 py-3 hover:brightness-[0.98]"
        >
          <Inbox className="size-5 text-[#8a5d00]" aria-hidden />
          <span className="font-medium">{t('today.pendingAbsences', { n: pending })}</span>
          <span className="ml-auto text-sm text-[#8a5d00]">{t('today.review')}</span>
        </Link>
      )}

      {isLoading ? (
        <SkeletonRows />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            {cards.map((c) => (
              <button
                key={c.key}
                onClick={() => setBucket(c.key)}
                aria-pressed={bucket === c.key}
                className={clsx(
                  'rounded-xl border px-5 py-4 text-left transition-colors',
                  bucket === c.key
                    ? 'border-stamp bg-surface ring-2 ring-stamp'
                    : 'border-rule bg-surface hover:bg-hover',
                )}
              >
                <span className={clsx('block text-4xl font-semibold tracking-tight', c.tone)}>
                  {buckets[c.key].length}
                </span>
                <span className="mt-1 block text-sm text-muted">{t(c.label)}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section>
              <h2 className="mb-2 font-semibold">
                {t(cards.find((c) => c.key === bucket)!.label)}
                <span className="ml-2 text-sm font-normal text-muted">
                  {list.length} {tp('employees', list.length)}
                </span>
              </h2>
              {bucket === 'onTime' && s && (
                <p className="mb-2 text-sm text-muted">
                  {t('today.onTimeHint', { time: minuteClock(s.shiftStartMinute) })}
                </p>
              )}
              {bucket === 'absent' && <p className="mb-2 text-sm text-muted">{t('today.absentHint')}</p>}
              <Panel className="overflow-hidden">
                {list.length === 0 ? (
                  <EmptyState title={t('today.emptyBucket')} />
                ) : (
                  <ul className="divide-y divide-rule">
                    {list.map(({ row, rec, abs }) => (
                      <li key={row.employeeId}>
                        <Link
                          to={`/employee/${encodeURIComponent(row.employeeId)}?m=${month}`}
                          className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 hover:bg-hover"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{row.employee.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {deptLabel(row.employee.department) || t('common.noDept')}
                              {abs.length > 0 &&
                                ` · ${minuteClock(abs[0].fromMinute)}–${minuteClock(abs[0].toMinute)} ${abs[0].reason}`}
                            </span>
                          </span>
                          <span className="text-right text-sm whitespace-nowrap">
                            {rec ? (
                              <>
                                <span className={clsx('font-semibold', rec.minutesLate ? 'text-late' : 'text-ink')}>
                                  {secClock(rec.firstIn)}
                                </span>
                                {rec.lastOut !== null && <span className="text-muted"> – {secClock(rec.lastOut)}</span>}
                                {!!rec.minutesLate && (
                                  <span className="block text-xs text-late">+{f.hm(rec.minutesLate)}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">{abs.length ? t('day.onLeave') : t('day.noMarks')}</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>

            <aside>
              <h2 className="mb-2 font-semibold">
                {t('today.overtimeTitle', { month: month ? f.monthLower(month) : '' })}
              </h2>
              <p className="mb-2 text-sm text-muted">
                {s && t('today.overtimeHint', { time: minuteClock(s.shiftEndMinute) })}
              </p>
              <Panel className="overflow-hidden">
                {overtimeTop.length === 0 ? (
                  <EmptyState title={t('today.noOvertime')} />
                ) : (
                  <ol className="divide-y divide-rule">
                    {overtimeTop.map((r, i) => (
                      <li key={r.employeeId}>
                        <Link
                          to={`/employee/${encodeURIComponent(r.employeeId)}?m=${month}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover"
                        >
                          <span className="w-5 text-right text-sm text-faint">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{r.employee.name}</span>
                          <span className="text-sm font-semibold whitespace-nowrap text-stamp">
                            {f.hm(r.minutesOvertime)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
              <Link to={`/tabel?m=${month}`} className="mt-3 inline-block text-sm text-stamp hover:underline">
                {t('today.toTabel')}
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
