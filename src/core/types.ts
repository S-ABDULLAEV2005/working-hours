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

export type DayFlag = 'SINGLE_EVENT' | 'NIGHT_EVENTS_IGNORED' | 'NON_WORKDAY' | 'NO_SCHEDULE' | 'SHORT_DAY' | 'EXCUSED'; // опоздание уменьшено или снято отгулом

/** День после применения правил графика. */
export interface DailyRecord extends DayFacts {
  minutesPresent: number;
  /** null — опоздание не считается (выходной, нет графика, одна отметка). */
  minutesLate: number | null;
  /** Работа после окончания дня (в выходной/праздник — всё время). */
  minutesOvertime: number;
  flags: DayFlag[];
}

export type AbsenceStatus = 'new' | 'checked' | 'rejected';

/** Отгул: сотрудник отпросился у руководителя. Засчитывается, если не отклонён. */
export interface Absence {
  id: number;
  employeeId: string;
  date: string;
  fromMinute: number;
  toMinute: number;
  reason: string;
  attachmentPath: string | null;
  status: AbsenceStatus;
  reviewNote: string;
  reviewedByName: string;
  createdAt: string;
}

export interface Holiday {
  date: string;
  kind: 'holiday' | 'short';
  /** Для сокращённого дня — время окончания (минуты от полуночи). */
  endMinute: number | null;
  name: string;
  comment: string;
}

export interface IdentityWarnings {
  /** Один ID — разные ФИО (в FaceID переименовали или ошибка). */
  sameIdDifferentNames: { employeeId: string; names: string[] }[];
  /** Одно ФИО — разные ID (однофамильцы или повторная регистрация). */
  sameNameDifferentIds: { name: string; employeeIds: string[] }[];
}

export interface Employee {
  employeeId: string;
  name: string;
  department: string;
  /** Исключён админом из табеля (гость, дубль и т. п.). */
  excluded?: boolean;
  excludedNote?: string;
}

export interface MonthlySummary {
  employeeId: string;
  month: string;
  daysPresent: number;
  minutesPresent: number;
  lateCount: number;
  minutesLate: number;
  singleEventDays: number;
  minutesOvertime: number;
  /** Дней с засчитанным отгулом. */
  absenceDays: number;
}

/** Правила графика — хранятся в базе, меняет админ. */
export interface Settings {
  shiftStartMinute: number;
  shiftEndMinute: number;
  noScheduleDepartments: string[];
  /** 1 = понедельник … 7 = воскресенье. */
  workdays: number[];
  /** Праздники (выходные дни). Заполняется из таблицы праздников. */
  holidays: string[];
  /** Сокращённые дни: дата → время окончания. Заполняется из таблицы праздников. */
  shortDays: Record<string, number>;
  lunch: { startMinute: number; endMinute: number } | null;
  /** «Мало посещений»: был меньше этой доли (%) рабочих дней загруженного периода. */
  lowAttendancePercent: number;
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
  warnings: IdentityWarnings;
  employees: Employee[];
  days: DayFacts[];
  issues: ParseIssue[];
  totalRows: number;
  duplicatesRemoved: number;
  period: { from: string; to: string; months: string[] };
}
