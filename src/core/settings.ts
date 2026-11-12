import type { Holiday, ImportRules, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  shiftStartMinute: 8 * 60,
  shiftEndMinute: 17 * 60,
  // Отдел кадров: у уборщиц «Хусусияти хоси низоми корӣ дар вақтҳои зарурӣ» — графика нет.
  noScheduleDepartments: ['Agency\\Cleaner'],
  workdays: [1, 2, 3, 4, 5],
  holidays: ['2026-09-09', '2026-11-06'],
  shortDays: {},
  lunch: null,
  lowAttendancePercent: 25,
};

export const IMPORT_RULES: ImportRules = {
  nightWindow: { fromMinute: 0, toMinute: 4 * 60 },
  duplicateWindowSeconds: 60,
};

/** Приводит настройки из базы к корректному виду (старые/частичные записи не ломают расчёт). */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const arr = <T>(v: unknown, d: T[]) => (Array.isArray(v) ? (v as T[]) : d);
  return {
    shiftStartMinute: num(r.shiftStartMinute, DEFAULT_SETTINGS.shiftStartMinute),
    shiftEndMinute: num(r.shiftEndMinute, DEFAULT_SETTINGS.shiftEndMinute),
    noScheduleDepartments: arr(r.noScheduleDepartments, DEFAULT_SETTINGS.noScheduleDepartments),
    workdays: arr(r.workdays, DEFAULT_SETTINGS.workdays),
    holidays: arr(r.holidays, DEFAULT_SETTINGS.holidays),
    shortDays: r.shortDays && typeof r.shortDays === 'object' ? (r.shortDays as Record<string, number>) : {},
    lowAttendancePercent: Math.min(
      100,
      Math.max(0, num(r.lowAttendancePercent, DEFAULT_SETTINGS.lowAttendancePercent)),
    ),
    lunch:
      r.lunch &&
      typeof r.lunch === 'object' &&
      typeof r.lunch.startMinute === 'number' &&
      typeof r.lunch.endMinute === 'number'
        ? { startMinute: r.lunch.startMinute, endMinute: r.lunch.endMinute }
        : null,
  };
}

/** Подставляет праздники и сокращённые дни из таблицы праздников. */
export function withHolidays(s: Settings, holidays: Holiday[]): Settings {
  const shortDays: Record<string, number> = {};
  for (const h of holidays) if (h.kind === 'short' && h.endMinute !== null) shortDays[h.date] = h.endMinute;
  return { ...s, holidays: holidays.filter((h) => h.kind === 'holiday').map((h) => h.date), shortDays };
}
