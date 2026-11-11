/** Одно событие камеры после разбора строки Excel. */
export interface AccessEvent {
  employeeId: string;
  name: string;
  department: string;
  device: string;
  /** Дата YYYY-MM-DD (локальное время камеры, без часовых поясов). */
  date: string;
  /** Секунды от начала суток (0..86399). */
  second: number;
  /** Номер строки в Excel (1 = заголовок). */
  row: number;
}

/**
 * Факты дня — то, что хранится в базе. Не зависят от настроек графика,
 * поэтому смена графика пересчитывает всё мгновенно, без повторной загрузки файла.
 */
export interface DayFacts {
  employeeId: string;
  date: string;
  /** Первая отметка, секунды от полуночи. */
  firstIn: number;
  /** Последняя отметка; null — за день одна отметка. */
  lastOut: number | null;
  /** Отметок после удаления дублей. */
  eventsCount: number;
  /** Были ночные отметки, которые не учтены. */
  nightIgnored: boolean;
}

export type DayFlag = 'SINGLE_EVENT' | 'NIGHT_EVENTS_IGNORED' | 'NON_WORKDAY' | 'NO_SCHEDULE';

/** День после применения правил графика. */
export interface DailyRecord extends DayFacts {
  minutesPresent: number;
  /** null — опоздание не считается (выходной, нет графика, одна отметка). */
  minutesLate: number | null;
  flags: DayFlag[];
}

export interface Employee {
  employeeId: string;
  name: string;
  department: string;
}

export interface MonthlySummary {
  employeeId: string;
  month: string;
  daysPresent: number;
  minutesPresent: number;
  lateCount: number;
  minutesLate: number;
  singleEventDays: number;
}

/** Правила графика — хранятся в базе, меняет админ. */
export interface Settings {
  shiftStartMinute: number;
  shiftEndMinute: number;
  noScheduleDepartments: string[];
  /** 1 = понедельник … 7 = воскресенье. */
  workdays: number[];
  holidays: string[];
  lunch: { startMinute: number; endMinute: number } | null;
}

/** Правила разбора файла — применяются в момент загрузки. */
export interface ImportRules {
  nightWindow: { fromMinute: number; toMinute: number };
  duplicateWindowSeconds: number;
}

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParseResult {
  events: AccessEvent[];
  issues: ParseIssue[];
  totalRows: number;
}

export interface ImportResult {
  employees: Employee[];
  days: DayFacts[];
  issues: ParseIssue[];
  totalRows: number;
  duplicatesRemoved: number;
  period: { from: string; to: string; months: string[] };
}
