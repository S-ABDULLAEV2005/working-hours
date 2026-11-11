const pad = (n: number): string => String(n).padStart(2, '0');

/** Секунды от полуночи → "ЧЧ:ММ". */
export const clock = (second: number | null): string =>
  second === null ? '—' : `${pad(Math.floor(second / 3600))}:${pad(Math.floor((second % 3600) / 60))}`;

/** Минуты → "Ч ч ММ мин". */
export const duration = (minutes: number | null): string => {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${pad(m)} мин`;
};

export const FLAG_LABELS: Record<string, string> = {
  SINGLE_EVENT: 'Одна отметка за день — время ухода неизвестно, опоздание не считается',
  NIGHT_EVENTS_IGNORED: 'Ночные отметки (00:00–04:00) не учтены',
  NON_WORKDAY: 'Выходной/праздник — опоздание не считается',
  NO_SCHEDULE: 'Нет фиксированного графика — опоздание не считается',
};

export const WEEKDAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
