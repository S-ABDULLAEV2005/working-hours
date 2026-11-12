import clsx from 'clsx';
import { isWorkday, isoWeekday, validAbsences, type Absence, type DailyRecord, type Settings } from '../core';
import { useI18n } from '../i18n';
import { secClock } from '../lib/format';

type Kind = 'ok' | 'late' | 'single' | 'leave' | 'absent' | 'weekend';

const COLOR: Record<Kind, string> = {
  ok: 'bg-stamp',
  late: 'bg-late',
  single: 'bg-single',
  leave: 'bg-ok/70',
  absent: 'border-2 border-dashed border-rule bg-transparent',
  weekend: 'bg-stamp/35',
};

/**
 * Простой график месяца: один столбик — один день.
 * Высота — сколько часов человек был на работе, цвет — как прошёл день.
 */
export function DayBars({
  dates,
  days,
  absences,
  settings,
}: {
  dates: string[];
  days: DailyRecord[];
  absences: Absence[];
  settings: Settings;
}) {
  const { t, f } = useI18n();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const leave = new Set(validAbsences(absences).map((a) => a.date));
  const norm = settings.shiftEndMinute - settings.shiftStartMinute;
  const max = Math.max(norm + 180, ...days.map((d) => d.minutesPresent));
  const H = 168;

  // Показываем рабочие дни и выходные, в которые человек приходил.
  const shown = dates.filter((d) => isWorkday(d, settings) || byDate.has(d));
  if (!shown.length) return null;

  const kindOf = (date: string): Kind => {
    const r = byDate.get(date);
    if (!r) return leave.has(date) ? 'leave' : 'absent';
    if (r.lastOut === null) return 'single';
    if (r.minutesLate) return 'late';
    if (!isWorkday(date, settings)) return 'weekend';
    return 'ok';
  };

  const legend: { k: Kind; label: string }[] = [
    { k: 'ok', label: t('bars.ok') },
    { k: 'late', label: t('bars.late') },
    { k: 'single', label: t('bars.single') },
    { k: 'leave', label: t('bars.leave') },
    { k: 'absent', label: t('bars.absent') },
    { k: 'weekend', label: t('bars.weekend') },
  ];

  return (
    <figure className="rounded-xl border border-rule bg-surface p-4 sm:p-5">
      <figcaption className="mb-1 font-semibold">{t('bars.title')}</figcaption>
      <p className="mb-4 text-sm text-muted">{t('bars.hint', { h: norm / 60 })}</p>

      <div className="overflow-x-auto pb-1">
        <div className="relative min-w-[560px]" style={{ height: H + 44 }}>
          {/* линия нормы */}
          <div
            className="absolute inset-x-0 border-t border-dashed border-stamp/60"
            style={{ bottom: 44 + (norm / max) * H }}
          ></div>
          <div className="absolute inset-0 flex items-end gap-[3px]">
            {shown.map((date) => {
              const r = byDate.get(date);
              const k = kindOf(date);
              const minutes = r?.lastOut != null ? r.minutesPresent : 0;
              const h =
                k === 'ok' || k === 'late' || k === 'weekend'
                  ? Math.max(6, (minutes / max) * H)
                  : k === 'absent'
                    ? H * 0.35
                    : k === 'leave'
                      ? H * 0.5
                      : 14;
              const day = Number(date.slice(8));
              const wd = isoWeekday(date);
              const tip = [
                `${f.dayLong(date)}, ${f.weekday(wd)}`,
                r
                  ? `${t('day.in')} ${secClock(r.firstIn)} · ${t('day.out')} ${secClock(r.lastOut)}`
                  : leave.has(date)
                    ? t('day.onLeave')
                    : t('day.noMarks'),
                r?.lastOut != null ? `${t('day.worked')}: ${f.hm(r.minutesPresent)}` : '',
                r?.minutesLate ? `${t('day.late')}: ${f.hm(r.minutesLate)}` : '',
              ]
                .filter(Boolean)
                .join('\n');
              return (
                <div
                  key={date}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end"
                  style={{ height: H + 44 }}
                  title={tip}
                >
                  <span
                    className={clsx(
                      'mb-1 text-[10px] leading-none font-medium',
                      k === 'late' ? 'text-late' : 'text-muted',
                    )}
                  >
                    {minutes ? (minutes < 30 ? '<1' : Math.round(minutes / 60)) : ''}
                  </span>
                  <div className={clsx('w-full max-w-[22px] rounded-t-[4px]', COLOR[k])} style={{ height: h }} />
                  <span
                    className={clsx(
                      'mt-1.5 text-[11px] leading-none',
                      isWorkday(date, settings) ? 'text-ink' : 'text-faint',
                    )}
                  >
                    {day}
                  </span>
                  <span className="mt-1 h-3 text-[9px] leading-none text-faint">{wd === 1 ? f.weekday(1) : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
        {legend.map((l) => (
          <li key={l.k} className="flex items-center gap-1.5">
            <span className={clsx('inline-block h-3 w-3 rounded-sm', COLOR[l.k])} />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-stamp/60" />
          {t('bars.norm', { h: norm / 60 })}
        </li>
      </ul>
    </figure>
  );
}
