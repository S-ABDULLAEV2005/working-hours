import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../i18n';
import type { MonthInfo } from '../lib/api';

/** Переключатель месяца: стрелки ходят только по месяцам, где есть данные. */
export function MonthSwitcher({
  month,
  months,
  onChange,
}: {
  month: string;
  months: MonthInfo[];
  onChange: (m: string) => void;
}) {
  const { t, f } = useI18n();
  const sorted = months.map((m) => m.month).sort();
  if (!sorted.includes(month)) {
    sorted.push(month);
    sorted.sort();
  }
  const i = sorted.indexOf(month);
  const prev = sorted[i - 1];
  const next = sorted[i + 1];
  const btn =
    'grid size-9 place-items-center rounded-md border border-rule bg-surface text-muted hover:bg-hover hover:text-ink disabled:opacity-35 disabled:hover:bg-surface';
  return (
    <div className="flex items-center gap-2">
      <button className={btn} disabled={!prev} onClick={() => prev && onChange(prev)} aria-label={t('month.prev')}>
        <ChevronLeft className="size-4" />
      </button>
      <select
        value={month}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('month.label')}
        className="h-9 rounded-md border border-rule bg-surface px-3 text-sm font-medium"
      >
        {[...sorted].reverse().map((m) => (
          <option key={m} value={m}>
            {f.monthTitle(m)}
          </option>
        ))}
      </select>
      <button className={btn} disabled={!next} onClick={() => next && onChange(next)} aria-label={t('month.next')}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
