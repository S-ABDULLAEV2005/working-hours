import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import clsx from 'clsx';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAYS, isWorkday, isoWeekday, type DailyRecord, type Settings } from '../core';
import { Button, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { monthDates } from '../components/Tabel';
import { useMonthData } from '../lib/data';
import { dayLong, deptLabel, hm, minuteClock, monthTitle } from '../lib/format';
import { todayIso, useMonthParam } from '../lib/useMonthParam';

// Шкала дня: 06:00–21:00
const SCALE_FROM = 6 * 60;
const SCALE_TO = 21 * 60;
const pct = (min: number) =>
  `${((Math.min(Math.max(min, SCALE_FROM), SCALE_TO) - SCALE_FROM) / (SCALE_TO - SCALE_FROM)) * 100}%`;

export function EmployeePage() {
  const { id = '' } = useParams();
  const { month, setMonth, months } = useMonthParam();
  const { data, error, isLoading } = useMonthData(month);
  const [exporting, setExporting] = useState(false);

  const row = useMemo(() => data?.rows.find((r) => r.employeeId === id), [data, id]);
  const back = `/${month ? `?m=${month}` : ''}`;

  if (months.isLoading || isLoading) return <SkeletonRows />;
  if (error)
    return (
      <Notice tone="error" title="Не удалось загрузить данные">
        {error.message}
      </Notice>
    );
  if (!month || !data) return <EmptyState title="Данных пока нет" />;

  const header = (
    <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Табель за {monthTitle(month).toLowerCase()}
    </Link>
  );

  if (!row) {
    return (
      <div className="mx-auto max-w-[1100px]">
        {header}
        <PageHeader
          title={`Сотрудник ID ${id}`}
          aside={<MonthSwitcher month={month} months={months.data ?? []} onChange={setMonth} />}
        />
        <Panel>
          <EmptyState title={`В ${monthTitle(month).toLowerCase()} камеры не видели этого сотрудника`}>
            Выберите другой месяц или вернитесь к табелю.
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const byDate = new Map(row.days.map((d) => [d.date, d]));
  const today = todayIso();
  const list = monthDates(month).filter((d) => byDate.has(d) || (isWorkday(d, data.settings) && d <= today));
  const absent = list.filter((d) => !byDate.has(d)).length;

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportMonth } = await import('../lib/exportReport');
      await exportMonth(month, data, [row]);
      toast.success('Отчёт скачан');
    } catch (e) {
      toast.error('Не удалось сформировать отчёт', { description: (e as Error).message });
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
            <Button onClick={doExport} loading={exporting}>
              {!exporting && <Download className="size-4" aria-hidden />}
              Скачать Excel
            </Button>
          </>
        }
      >
        {deptLabel(row.employee.department)}, ID в FaceID {row.employeeId}
      </PageHeader>

      <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-rule py-5 sm:grid-cols-4">
        <Stat
          label="дней на работе"
          value={String(row.daysPresent)}
          note={absent ? `рабочих дней без отметок: ${absent}` : undefined}
        />
        <Stat label="отработано" value={hm(row.minutesPresent)} />
        {row.noSchedule ? (
          <Stat label="опоздания" value="—" note="нет фиксированного графика" />
        ) : (
          <Stat
            label="опозданий"
            value={String(row.lateCount)}
            note={row.lateCount ? `всего ${hm(row.minutesLate)}` : undefined}
            tone={row.lateCount ? 'late' : undefined}
          />
        )}
        <Stat
          label="дней без отметки ухода"
          value={String(row.singleEventDays)}
          tone={row.singleEventDays ? 'single' : undefined}
        />
      </dl>

      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[150px_1fr_72px_72px_96px_110px] items-end gap-4 border-b border-rule px-5 py-3 text-xs text-muted md:grid">
          <span>День</span>
          <Scale settings={data.settings} />
          <span className="text-right">Пришёл</span>
          <span className="text-right">Ушёл</span>
          <span className="text-right">Отработано</span>
          <span className="text-right">Опоздание</span>
        </div>
        <ul className="divide-y divide-rule">
          {list.map((date) => (
            <DayRow key={date} date={date} rec={byDate.get(date)} settings={data.settings} />
          ))}
        </ul>
      </Panel>
      <p className="mt-3 text-xs text-muted">
        Полоса показывает время между первой и последней отметкой камер. Красный участок — опоздание после{' '}
        {minuteClock(data.settings.shiftStartMinute)}.
      </p>
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

function DayRow({ date, rec, settings }: { date: string; rec?: DailyRecord; settings: Settings }) {
  const wd = isoWeekday(date);
  const workday = isWorkday(date, settings);
  const start = settings.shiftStartMinute;
  const end = settings.shiftEndMinute;
  const inMin = rec ? Math.floor(rec.firstIn / 60) : 0;
  const outMin = rec?.lastOut != null ? Math.floor(rec.lastOut / 60) : null;

  let note = '';
  if (!rec) note = 'Рабочий день, камеры не видели сотрудника';
  else if (rec.lastOut === null) note = 'Одна отметка: уход не зафиксирован, опоздание не считается';
  else if (rec.flags.includes('NON_WORKDAY')) note = wd >= 6 ? 'Выходной день' : 'Праздник';

  return (
    <li
      className={clsx(
        'grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[150px_1fr_72px_72px_96px_110px] md:items-center',
        !workday && 'bg-paper/60',
      )}
    >
      <div className="col-span-2 md:col-span-1">
        <span className="font-medium">{dayLong(date)}</span>
        <span className={clsx('ml-2 text-sm', workday ? 'text-muted' : 'text-faint')}>
          {WEEKDAYS[wd].toLowerCase()}
        </span>
      </div>

      <div className="relative col-span-2 h-6 md:col-span-1" aria-hidden>
        {/* рабочие часы */}
        <div
          className="absolute inset-y-[9px] rounded-full bg-hover"
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
        />
        <div className="absolute inset-y-0 w-px bg-faint/60" style={{ left: pct(start) }} />
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
              left: pct(start),
              width: `calc(${pct(inMin)} - ${pct(start)})`,
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
          <Cell label="Пришёл" value={minuteClock(inMin)} tone={rec.minutesLate ? 'late' : undefined} />
          <Cell
            label="Ушёл"
            value={outMin === null ? '—' : minuteClock(outMin)}
            tone={outMin === null ? 'single' : undefined}
          />
          <Cell label="Отработано" value={outMin === null ? '—' : hm(rec.minutesPresent)} />
          <Cell
            label="Опоздание"
            value={rec.minutesLate === null ? '—' : rec.minutesLate ? hm(rec.minutesLate) : 'нет'}
            tone={rec.minutesLate ? 'late' : 'muted'}
          />
        </>
      ) : (
        <span className="col-span-2 text-sm text-muted md:col-span-4 md:text-right">нет отметок</span>
      )}
      {note && rec && <p className="col-span-2 text-xs text-muted md:col-start-2 md:col-end-7">{note}</p>}
    </li>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'late' | 'single' | 'muted' }) {
  return (
    <div className="md:text-right">
      <span className="text-xs text-muted md:hidden">{label} </span>
      <span
        className={clsx(
          'whitespace-nowrap',
          tone === 'late' && 'font-semibold text-late',
          tone === 'single' && 'font-semibold text-single',
          tone === 'muted' && 'text-faint',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'late' | 'single' }) {
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
      <dt className="text-sm text-muted">
        {label}
        {note && <span className="block text-xs">{note}</span>}
      </dt>
    </div>
  );
}
