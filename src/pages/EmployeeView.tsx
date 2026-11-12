import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { ArrowLeft, CalendarPlus, Download, EyeOff, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { isWorkday, isoWeekday, validAbsences, type Absence, type DailyRecord, type Settings } from '../core';
import { AbsenceForm, AbsenceRow, Modal } from '../components/Absences';
import { DayBars } from '../components/DayBars';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { StatTiles, type Tile } from '../components/StatTiles';
import { Button, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { monthRange } from '../lib/api';
import { useApi, useAuth } from '../lib/auth';
import { qk, useMonthData } from '../lib/data';
import { deptLabel, minuteClock, secClock, todayIso } from '../lib/format';
import { useMonthParam } from '../lib/useMonthParam';

type Filter = 'days' | 'worked' | 'late' | 'single' | 'overtime' | 'absences';

// Шкала полосы дня: 06:00–21:00
const SCALE_FROM = 6 * 60;
const SCALE_TO = 21 * 60;
const pct = (min: number) =>
  `${((Math.min(Math.max(min, SCALE_FROM), SCALE_TO) - SCALE_FROM) / (SCALE_TO - SCALE_FROM)) * 100}%`;

/** Страница сотрудника. Для Коргара это «Моя страница» (mine = true). */
export function EmployeeView({ mine = false }: { mine?: boolean }) {
  const params = useParams();
  const { profile } = useAuth();
  const id = mine ? (profile?.employeeId ?? '') : (params.id ?? '');
  const { t, f } = useI18n();
  const { month, setMonth, months } = useMonthParam();
  const { data, error, isLoading } = useMonthData(month);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [absOpen, setAbsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const admin = profile?.role === 'admin';

  const row = useMemo(() => data?.rows.find((r) => r.employeeId === id), [data, id]);
  const back = `/tabel${month ? `?m=${month}` : ''}`;

  if (mine && !profile?.employeeId) return <Notice tone="error" title={t('me.notLinked')} />;
  if (months.isLoading || isLoading) return <SkeletonRows />;
  if (error)
    return (
      <Notice tone="error" title={t('common.loadError')}>
        {error.message}
      </Notice>
    );

  const header = !mine && (
    <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> {t('emp.back')}
    </Link>
  );

  const addAbsence = mine ? (
    <Button variant="primary" onClick={() => setAbsOpen(true)}>
      <CalendarPlus className="size-4" aria-hidden /> {t('abs.add')}
    </Button>
  ) : null;

  if (!month || !data) {
    return (
      <div className="mx-auto max-w-[1100px]">
        {header}
        <PageHeader title={mine ? t('me.title') : `ID ${id}`} aside={addAbsence} />
        <Panel>
          <EmptyState title={t('common.noData')}>{mine ? t('me.noDataHint') : undefined}</EmptyState>
        </Panel>
        {mine && <AbsenceForm open={absOpen} onClose={() => setAbsOpen(false)} />}
      </div>
    );
  }

  const today = todayIso();
  const lastData = data.dates[data.dates.length - 1] ?? today;
  const visibleDates = monthDates(month).filter((d) => d <= (lastData > today ? lastData : today));

  if (!row) {
    return (
      <div className="mx-auto max-w-[1100px]">
        {header}
        <PageHeader
          title={mine ? (profile?.fullName ?? t('me.title')) : `ID ${id}`}
          aside={
            <>
              <MonthSwitcher month={month} months={months.data ?? []} onChange={setMonth} />
              {addAbsence}
            </>
          }
        />
        <Panel>
          <EmptyState title={t('emp.notSeen', { month: f.monthLower(month) })}>{t('emp.notSeenHint')}</EmptyState>
        </Panel>
        {mine && <AbsenceForm open={absOpen} onClose={() => setAbsOpen(false)} />}
      </div>
    );
  }

  const byDate = new Map(row.days.map((d) => [d.date, d]));
  const absByDate = new Map<string, Absence[]>();
  for (const a of row.absences) absByDate.set(a.date, [...(absByDate.get(a.date) ?? []), a]);

  // Какие дни показывать в списке при выбранном фильтре.
  const all = visibleDates.filter(
    (d) => byDate.has(d) || absByDate.has(d) || (isWorkday(d, data.settings) && d <= lastData),
  );
  const listDates = all.filter((d) => {
    const r = byDate.get(d);
    switch (filter) {
      case 'days':
      case 'worked':
        return !!r;
      case 'late':
        return !!r?.minutesLate;
      case 'single':
        return r?.lastOut === null;
      case 'overtime':
        return !!r?.minutesOvertime;
      case 'absences':
        return absByDate.has(d);
      default:
        return true;
    }
  });
  const absentDays = all.filter((d) => !byDate.has(d) && !absByDate.has(d) && isWorkday(d, data.settings)).length;

  const tiles: Tile<Filter>[] = [
    {
      key: 'days',
      label: t('stat.daysPresent'),
      value: String(row.daysPresent),
      note: absentDays ? t('emp.absentDays', { n: absentDays }) : undefined,
    },
    { key: 'worked', label: t('stat.worked'), value: f.hm(row.minutesPresent) },
    row.noSchedule
      ? { key: 'late', label: t('stat.lates'), value: '—', note: t('common.noSchedule'), disabled: true }
      : {
          key: 'late',
          label: t('stat.lates'),
          value: String(row.lateCount),
          note: row.lateCount ? f.hm(row.minutesLate) : undefined,
          tone: row.lateCount ? 'late' : undefined,
        },
    {
      key: 'single',
      label: t('stat.singleDays'),
      value: String(row.singleEventDays),
      tone: row.singleEventDays ? 'single' : undefined,
    },
    {
      key: 'overtime',
      label: t('stat.overtime'),
      value: f.hm(row.minutesOvertime),
      tone: row.minutesOvertime ? 'stamp' : undefined,
    },
    {
      key: 'absences',
      label: t('stat.absencesCount'),
      value: String(row.absences.length),
      tone: row.absences.length ? 'ok' : undefined,
    },
  ];

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportMonth } = await import('../lib/exportReport');
      await exportMonth(month, data, [row], t, f);
      toast.success(t('export.done'));
    } catch (e) {
      toast.error(t('export.failed'), { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      {header}
      <PageHeader
        title={row.employee.name}
        aside={
          <>
            <MonthSwitcher month={month} months={months.data ?? []} onChange={setMonth} />
            {addAbsence}
            <Button onClick={doExport} loading={exporting}>
              {!exporting && <Download className="size-4" aria-hidden />}
              {t('export.excel')}
            </Button>
          </>
        }
      >
        {deptLabel(row.employee.department) || t('common.noDept')}, {t('common.faceId')} {row.employeeId}
        {row.group === 'excluded' && <span className="ml-2 font-medium text-late">· {t('tabel.tab.excluded')}</span>}
      </PageHeader>

      {admin && !mine && (
        <ExcludeControl
          employeeId={row.employeeId}
          excluded={!!row.employee.excluded}
          note={row.employee.excludedNote ?? ''}
        />
      )}

      <div className="mb-6">
        <StatTiles tiles={tiles} active={filter} onSelect={setFilter} label={t('stat.filterLabel')} />
      </div>

      <div className="mb-6">
        <DayBars dates={visibleDates} days={row.days} absences={row.absences} settings={data.settings} />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">
          {filter ? tiles.find((x) => x.key === filter)?.label : t('emp.byDays')}
          <span className="ml-2 text-sm font-normal text-muted">{listDates.length}</span>
        </h2>
        {filter && (
          <button onClick={() => setFilter(null)} className="text-sm text-stamp hover:underline">
            {t('stat.reset')}
          </button>
        )}
      </div>
      <Panel className="mb-8 overflow-hidden">
        {listDates.length === 0 ? (
          <EmptyState title={t('emp.noDaysForFilter')} />
        ) : (
          <>
            <div className="hidden grid-cols-[150px_1fr_72px_72px_96px_110px] items-end gap-4 border-b border-rule px-5 py-3 text-xs text-muted md:grid">
              <span>{t('day.day')}</span>
              <Scale settings={data.settings} />
              <span className="text-right">{t('day.in')}</span>
              <span className="text-right">{t('day.out')}</span>
              <span className="text-right">{t('day.worked')}</span>
              <span className="text-right">{filter === 'overtime' ? t('day.overtime') : t('day.late')}</span>
            </div>
            <ul className="divide-y divide-rule">
              {listDates.map((date) => (
                <DayRow
                  key={date}
                  date={date}
                  rec={byDate.get(date)}
                  abs={absByDate.get(date) ?? []}
                  settings={data.settings}
                  showOvertime={filter === 'overtime'}
                />
              ))}
            </ul>
          </>
        )}
      </Panel>

      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t('abs.titleMonth', { month: f.monthLower(month) })}</h2>
        {admin && !mine && (
          <Button onClick={() => setAbsOpen(true)}>
            <CalendarPlus className="size-4" aria-hidden /> {t('abs.addFor')}
          </Button>
        )}
      </div>
      <Panel className="overflow-hidden">
        {row.absences.length === 0 ? (
          <EmptyState title={t('abs.none')}>{mine ? t('abs.noneHintMine') : undefined}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {[...row.absences].reverse().map((a) => (
              <AbsenceRow key={a.id} a={a} canDelete={mine || admin} />
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted">
        {t('emp.footnote', { time: minuteClock(data.settings.shiftStartMinute) })}
      </p>

      <AbsenceForm open={absOpen} onClose={() => setAbsOpen(false)} employeeId={mine ? undefined : row.employeeId} />
    </div>
  );
}

export function monthDates(month: string): string[] {
  const { to } = monthRange(month);
  const n = Number(to.slice(8));
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

function ExcludeControl({ employeeId, excluded, note }: { employeeId: string; excluded: boolean; note: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const { t } = useI18n();
  const errText = useErrorText();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (value: boolean, n: string) => {
    setBusy(true);
    try {
      await api.setEmployeeExcluded(employeeId, value, n);
      await qc.invalidateQueries({ queryKey: qk.employees });
      toast.success(value ? t('excl.done') : t('excl.restored'));
      setOpen(false);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-5">
      {excluded ? (
        <Notice
          tone="warn"
          title={t('excl.isExcluded')}
          action={
            <Button onClick={() => run(false, '')} loading={busy}>
              <Undo2 className="size-4" aria-hidden /> {t('excl.restore')}
            </Button>
          }
        >
          {note || t('excl.noNote')}
        </Notice>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <EyeOff className="size-4" aria-hidden /> {t('excl.action')}
        </Button>
      )}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={t('excl.action')} locked={busy}>
        <p className="text-sm text-muted">{t('excl.explain')}</p>
        <label className="mt-4 block text-sm font-medium">
          {t('excl.note')}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('excl.notePlaceholder')}
            className="mt-1.5 h-10 w-full rounded-md border border-rule px-3"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => run(true, text.trim())} loading={busy}>
            {t('excl.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Scale({ settings }: { settings: Settings }) {
  const ticks = [6, 8, 10, 12, 14, 16, 18, 20];
  return (
    <div className="relative h-4">
      {ticks.map((h) => (
        <span
          key={h}
          className={clsx(
            'absolute -translate-x-1/2',
            h * 60 === settings.shiftStartMinute ? 'font-semibold text-ink' : '',
          )}
          style={{ left: pct(h * 60) }}
        >
          {h}:00
        </span>
      ))}
    </div>
  );
}

function DayRow({
  date,
  rec,
  abs,
  settings,
  showOvertime,
}: {
  date: string;
  rec?: DailyRecord;
  abs: Absence[];
  settings: Settings;
  showOvertime: boolean;
}) {
  const { t, f } = useI18n();
  const wd = isoWeekday(date);
  const workday = isWorkday(date, settings);
  const start = settings.shiftStartMinute;
  const end = settings.shortDays[date] ?? settings.shiftEndMinute;
  const inMin = rec ? Math.floor(rec.firstIn / 60) : 0;
  const outMin = rec?.lastOut != null ? Math.floor(rec.lastOut / 60) : null;
  const valid = validAbsences(abs);

  const notes: string[] = [];
  if (rec?.lastOut === null) notes.push(t('day.noteSingle'));
  if (rec?.flags.includes('NON_WORKDAY')) notes.push(wd >= 6 ? t('day.noteWeekend') : t('day.noteHoliday'));
  if (rec?.flags.includes('SHORT_DAY')) notes.push(t('day.noteShort', { time: minuteClock(end) }));
  if (rec?.flags.includes('EXCUSED')) notes.push(t('day.noteExcused'));
  for (const a of abs) {
    notes.push(
      `${t('stat.absences')} ${minuteClock(a.fromMinute)}–${minuteClock(a.toMinute)}: ${a.reason}` +
        (a.status === 'rejected' ? ` (${t('abs.status.rejected').toLowerCase()})` : ''),
    );
  }

  const lateCell = showOvertime
    ? { v: rec?.minutesOvertime ? f.hm(rec.minutesOvertime) : '—', tone: rec?.minutesOvertime ? 'stamp' : 'muted' }
    : {
        v: !rec || rec.minutesLate === null ? '—' : rec.minutesLate ? f.hm(rec.minutesLate) : t('common.no'),
        tone: rec?.minutesLate ? 'late' : 'muted',
      };

  return (
    <li
      className={clsx(
        'grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[150px_1fr_72px_72px_96px_110px] md:items-center',
        !workday && 'bg-paper/60',
      )}
    >
      <div className="col-span-2 md:col-span-1">
        <span className="font-medium">{f.dayLong(date)}</span>
        <span className={clsx('ml-2 text-sm', workday ? 'text-muted' : 'text-faint')}>{f.weekday(wd)}</span>
      </div>

      <div className="relative col-span-2 h-6 md:col-span-1" aria-hidden>
        <div
          className="absolute inset-y-[9px] rounded-full bg-hover"
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
        />
        <div className="absolute inset-y-0 w-px bg-faint/60" style={{ left: pct(start) }} />
        {valid.map((a) => (
          <div
            key={a.id}
            className="absolute inset-y-[5px] rounded-[3px] border border-ok/60 bg-ok-soft"
            style={{ left: pct(a.fromMinute), width: `calc(${pct(a.toMinute)} - ${pct(a.fromMinute)})` }}
          />
        ))}
        {rec && outMin !== null && (
          <div
            className={clsx(
              'absolute inset-y-[6px] rounded-[3px]',
              rec.flags.includes('NON_WORKDAY') ? 'bg-stamp/40' : 'bg-stamp',
            )}
            style={{ left: pct(inMin), width: `max(3px, calc(${pct(outMin)} - ${pct(inMin)}))` }}
          />
        )}
        {rec && !!rec.minutesLate && (
          <div
            className="absolute inset-y-[6px] rounded-l-[3px] bg-late/80"
            style={{
              left: pct(inMin - rec.minutesLate),
              width: `calc(${pct(inMin)} - ${pct(inMin - rec.minutesLate)})`,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.35) 3px 5px)',
            }}
          />
        )}
        {rec && outMin === null && (
          <div
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-single ring-2 ring-surface"
            style={{ left: pct(inMin) }}
          />
        )}
      </div>

      {rec ? (
        <>
          <Cell label={t('day.in')} value={secClock(rec.firstIn)} tone={rec.minutesLate ? 'late' : undefined} />
          <Cell label={t('day.out')} value={secClock(rec.lastOut)} tone={outMin === null ? 'single' : undefined} />
          <Cell label={t('day.worked')} value={outMin === null ? '—' : f.hm(rec.minutesPresent)} />
          <Cell
            label={showOvertime ? t('day.overtime') : t('day.late')}
            value={lateCell.v}
            tone={lateCell.tone as CellTone}
          />
        </>
      ) : (
        <span
          className={clsx('col-span-2 text-sm md:col-span-4 md:text-right', valid.length ? 'text-ok' : 'text-muted')}
        >
          {valid.length ? t('day.onLeave') : t('day.noMarks')}
        </span>
      )}
      {notes.length > 0 && (
        <p className="col-span-2 text-xs text-muted md:col-start-2 md:col-end-7">{notes.join(' · ')}</p>
      )}
    </li>
  );
}

type CellTone = 'late' | 'single' | 'muted' | 'stamp' | undefined;

function Cell({ label, value, tone }: { label: string; value: string; tone?: CellTone }) {
  return (
    <div className="md:text-right">
      <span className="text-xs text-muted md:hidden">{label} </span>
      <span
        className={clsx(
          'whitespace-nowrap',
          tone === 'late' && 'font-semibold text-late',
          tone === 'single' && 'font-semibold text-single',
          tone === 'stamp' && 'font-semibold text-stamp',
          tone === 'muted' && 'text-faint',
        )}
      >
        {value}
      </span>
    </div>
  );
}
