import { memo } from 'react';
import clsx from 'clsx';
import { isWorkday, type DailyRecord, type Settings } from '../core';
import { dayLong, hm } from '../lib/format';
import { minuteClock } from '../lib/format';

/**
 * Мини-табель: одна клетка на каждый день месяца — как в бумажном табеле учёта.
 * Вовремя — заливка чернилами, опоздание — красная, одна отметка — жёлтая,
 * рабочий день без отметок — пустая рамка, выходной без отметок — точка.
 */
export type CellKind = 'ok' | 'late' | 'single' | 'weekend' | 'absent' | 'off' | 'future';

export function cellKind(rec: DailyRecord | undefined, date: string, s: Settings, today: string): CellKind {
  if (rec) {
    if (rec.lastOut === null) return 'single';
    if (rec.minutesLate) return 'late';
    if (rec.flags.includes('NON_WORKDAY')) return 'weekend';
    return 'ok';
  }
  if (date > today) return 'future';
  return isWorkday(date, s) ? 'absent' : 'off';
}

const KIND_CLASS: Record<CellKind, string> = {
  ok: 'bg-stamp',
  late: 'bg-late',
  single: 'bg-single',
  weekend: 'bg-stamp/35',
  absent: 'border border-faint/70 bg-transparent',
  off: 'bg-transparent after:absolute after:inset-x-0 after:top-1/2 after:mx-auto after:size-[3px] after:-translate-y-1/2 after:rounded-full after:bg-rule',
  future: 'bg-transparent',
};

export const KIND_LABEL: Record<CellKind, string> = {
  ok: 'Пришёл вовремя',
  late: 'Опоздание',
  single: 'Одна отметка — уход не зафиксирован',
  weekend: 'Выходной, был на работе',
  absent: 'Рабочий день, отметок нет',
  off: 'Выходной',
  future: 'Ещё не наступил',
};

export function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

function tooltip(rec: DailyRecord | undefined, date: string, kind: CellKind) {
  const head = dayLong(date);
  if (!rec) return `${head}: ${KIND_LABEL[kind].toLowerCase()}`;
  const inT = minuteClock(Math.floor(rec.firstIn / 60));
  if (rec.lastOut === null) return `${head}: одна отметка в ${inT}`;
  const out = minuteClock(Math.floor(rec.lastOut / 60));
  const late = rec.minutesLate ? `, опоздание ${hm(rec.minutesLate)}` : '';
  return `${head}: ${inT}–${out}, ${hm(rec.minutesPresent)}${late}`;
}

export const TabelStrip = memo(function TabelStrip({
  dates,
  byDate,
  settings,
  today,
}: {
  dates: string[];
  byDate: Map<string, DailyRecord>;
  settings: Settings;
  today: string;
}) {
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {dates.map((date, i) => {
        const rec = byDate.get(date);
        const kind = cellKind(rec, date, settings, today);
        return (
          <span
            key={date}
            title={tooltip(rec, date, kind)}
            style={{ animationDelay: `${i * 12}ms` }}
            className={clsx('tabel-cell relative h-[18px] w-[9px] shrink-0 rounded-[2px]', KIND_CLASS[kind])}
          />
        );
      })}
    </div>
  );
});

export function TabelHeader({ dates, settings }: { dates: string[]; settings: Settings }) {
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {dates.map((date) => {
        const d = Number(date.slice(8));
        const show = d === 1 || d % 5 === 0;
        return (
          <span
            key={date}
            className={clsx(
              'w-[9px] shrink-0 text-center text-[10px] leading-none',
              isWorkday(date, settings) ? 'text-muted' : 'text-faint',
            )}
          >
            {show ? d : ''}
          </span>
        );
      })}
    </div>
  );
}

export function TabelLegend() {
  const items: CellKind[] = ['ok', 'late', 'single', 'weekend', 'absent'];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
      {items.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={clsx('relative inline-block h-3 w-[7px] rounded-[2px]', KIND_CLASS[k])} />
          {KIND_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
