import type {
  Absence,
  AccessEvent,
  DailyRecord,
  DayFacts,
  DayFlag,
  Employee,
  IdentityWarnings,
  ImportRules,
  MonthlySummary,
  Settings,
} from './types';

/** День недели ISO: 1 = понедельник … 7 = воскресенье. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isWorkday(date: string, s: Settings): boolean {
  return s.workdays.includes(isoWeekday(date)) && !s.holidays.includes(date);
}

/** Удаляет повторные срабатывания ближе windowSeconds к последней учтённой отметке. Вход отсортирован. */
export function dedupe(sortedSeconds: number[], windowSeconds: number): number[] {
  const out: number[] = [];
  for (const sec of sortedSeconds) {
    if (out.length === 0 || sec - out[out.length - 1] >= windowSeconds) out.push(sec);
  }
  return out;
}

/** Актуальные ФИО и отдел — по самому позднему событию сотрудника. */
export function buildEmployees(events: AccessEvent[]): Employee[] {
  const latest = new Map<string, AccessEvent>();
  for (const e of events) {
    const prev = latest.get(e.employeeId);
    if (!prev || e.date > prev.date || (e.date === prev.date && e.second > prev.second)) {
      latest.set(e.employeeId, e);
    }
  }
  return [...latest.values()].map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    department: e.department,
  }));
}

/** События → факты дня (приход, уход, число отметок). Не зависит от графика. */
export function aggregateDays(
  events: AccessEvent[],
  rules: ImportRules,
): { days: DayFacts[]; duplicatesRemoved: number } {
  const groups = new Map<string, number[]>();
  for (const e of events) {
    const key = `${e.employeeId}|${e.date}`;
    const list = groups.get(key);
    if (list) list.push(e.second);
    else groups.set(key, [e.second]);
  }

  const days: DayFacts[] = [];
  let duplicatesRemoved = 0;
  const { fromMinute, toMinute } = rules.nightWindow;
  for (const [key, raw] of groups) {
    const [employeeId, date] = key.split('|');
    const sorted = [...raw].sort((a, b) => a - b);
    const daytime = sorted.filter((sec) => {
      const minute = Math.floor(sec / 60);
      return !(minute >= fromMinute && minute < toMinute);
    });
    if (daytime.length === 0) continue; // только ночные отметки — рабочего дня нет
    const seconds = dedupe(daytime, rules.duplicateWindowSeconds);
    duplicatesRemoved += daytime.length - seconds.length;
    days.push({
      employeeId,
      date,
      firstIn: seconds[0],
      lastOut: seconds.length > 1 ? seconds[seconds.length - 1] : null,
      eventsCount: seconds.length,
      nightIgnored: daytime.length < sorted.length,
    });
  }
  days.sort((a, b) =>
    a.employeeId === b.employeeId
      ? a.date.localeCompare(b.date)
      : a.employeeId.localeCompare(b.employeeId, 'en', { numeric: true }),
  );
  return { days, duplicatesRemoved };
}

/** Отгулы, которые засчитываются (не отклонённые). */
export const validAbsences = (list: Absence[] | undefined) => (list ?? []).filter((a) => a.status !== 'rejected');

/**
 * Начало дня с учётом отгулов: если сотрудник отпросился с начала дня (например, 08:00–11:00),
 * опоздание считается от окончания отгула. Несколько подряд идущих отгулов складываются.
 */
export function effectiveStart(shiftStart: number, absences: Absence[]): number {
  let start = shiftStart;
  const sorted = [...absences].sort((a, b) => a.fromMinute - b.fromMinute);
  for (const a of sorted) if (a.fromMinute <= start && a.toMinute > start) start = a.toMinute;
  return start;
}

export function dayEndMinute(date: string, s: Settings): number {
  return s.shortDays[date] ?? s.shiftEndMinute;
}

/** Применяет правила графика (и отгулы этого дня) к факту дня. */
export function evaluateDay(f: DayFacts, department: string, s: Settings, absences: Absence[] = []): DailyRecord {
  const flags: DayFlag[] = [];
  if (f.nightIgnored) flags.push('NIGHT_EVENTS_IGNORED');
  const single = f.lastOut === null;
  if (single) flags.push('SINGLE_EVENT');

  let minutesPresent = 0;
  if (f.lastOut !== null) {
    minutesPresent = Math.floor((f.lastOut - f.firstIn) / 60);
    if (s.lunch && f.firstIn <= s.lunch.startMinute * 60 && f.lastOut >= s.lunch.endMinute * 60) {
      minutesPresent -= s.lunch.endMinute - s.lunch.startMinute;
    }
  }

  const noSchedule = s.noScheduleDepartments.includes(department);
  const workday = isWorkday(f.date, s);
  if (noSchedule) flags.push('NO_SCHEDULE');
  else if (!workday) flags.push('NON_WORKDAY');
  if (workday && s.shortDays[f.date] !== undefined) flags.push('SHORT_DAY');

  let minutesLate: number | null = null;
  // Одна отметка: неизвестно, приход это или уход — опоздание не начисляем.
  if (!single && !noSchedule && workday) {
    const arrived = Math.floor(f.firstIn / 60);
    const plain = Math.max(0, arrived - s.shiftStartMinute);
    const valid = validAbsences(absences);
    const start = valid.length ? effectiveStart(s.shiftStartMinute, valid) : s.shiftStartMinute;
    minutesLate = start >= dayEndMinute(f.date, s) ? 0 : Math.max(0, arrived - start);
    if (plain > minutesLate) flags.push('EXCUSED');
  }

  let minutesOvertime = 0;
  if (f.lastOut !== null && !noSchedule) {
    minutesOvertime = workday
      ? Math.max(0, Math.floor(f.lastOut / 60) - Math.max(dayEndMinute(f.date, s), Math.floor(f.firstIn / 60)))
      : minutesPresent;
  }

  return { ...f, minutesPresent, minutesLate, minutesOvertime, flags };
}

/** Отгулы, сгруппированные по «сотрудник|дата». */
export function absencesByDay(list: Absence[]): Map<string, Absence[]> {
  const m = new Map<string, Absence[]>();
  for (const a of list) {
    const k = `${a.employeeId}|${a.date}`;
    const l = m.get(k);
    if (l) l.push(a);
    else m.set(k, [a]);
  }
  return m;
}

export function evaluateDays(
  facts: DayFacts[],
  employees: Map<string, Employee>,
  s: Settings,
  absences: Absence[] = [],
): DailyRecord[] {
  const byDay = absencesByDay(absences);
  return facts.map((f) =>
    evaluateDay(f, employees.get(f.employeeId)?.department ?? '', s, byDay.get(`${f.employeeId}|${f.date}`)),
  );
}

export function summarize(daily: DailyRecord[], month: string, absences: Absence[] = []): MonthlySummary[] {
  const byEmp = new Map<string, MonthlySummary>();
  const get = (id: string) => {
    let m = byEmp.get(id);
    if (!m) {
      m = {
        employeeId: id,
        month,
        daysPresent: 0,
        minutesPresent: 0,
        lateCount: 0,
        minutesLate: 0,
        singleEventDays: 0,
        minutesOvertime: 0,
        absenceDays: 0,
      };
      byEmp.set(id, m);
    }
    return m;
  };
  for (const d of daily) {
    if (!d.date.startsWith(month)) continue;
    const m = get(d.employeeId);
    m.daysPresent++;
    m.minutesPresent += d.minutesPresent;
    m.minutesOvertime += d.minutesOvertime;
    if (d.minutesLate !== null && d.minutesLate > 0) {
      m.lateCount++;
      m.minutesLate += d.minutesLate;
    }
    if (d.lastOut === null) m.singleEventDays++;
  }
  const absDays = new Set<string>();
  for (const a of validAbsences(absences)) {
    if (!a.date.startsWith(month)) continue;
    const k = `${a.employeeId}|${a.date}`;
    if (absDays.has(k)) continue;
    absDays.add(k);
    get(a.employeeId).absenceDays++;
  }
  return [...byEmp.values()];
}

/** Рабочие дни между датами включительно. */
export function workdaysBetween(from: string, to: string, s: Settings): number {
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    if (isWorkday(d.toISOString().slice(0, 10), s)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/**
 * Порог «мало посещений» для месяца: доля рабочих дней в загруженном периоде этого месяца.
 * Период — от 1-го числа (или первой даты в данных) до последней загруженной даты месяца.
 * Возвращает минимальное число дней, начиная с которого сотрудник считается «обычным».
 */
export function lowAttendanceThreshold(
  dates: string[],
  month: string,
  s: Settings,
): { workdays: number; minDays: number } {
  const inMonth = dates.filter((d) => d.startsWith(month)).sort();
  if (!inMonth.length) return { workdays: 0, minDays: 0 };
  const workdays = workdaysBetween(
    `${month}-01` < inMonth[0] ? `${month}-01` : inMonth[0],
    inMonth[inMonth.length - 1],
    s,
  );
  return { workdays, minDays: (workdays * s.lowAttendancePercent) / 100 };
}

/** Предупреждения о совпадениях ID и ФИО в загруженном файле. */
export function identityWarnings(events: AccessEvent[]): IdentityWarnings {
  const norm = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim();
  const namesById = new Map<string, Map<string, string>>();
  const idsByName = new Map<string, { name: string; ids: Set<string> }>();
  for (const e of events) {
    const n = norm(e.name);
    if (!namesById.has(e.employeeId)) namesById.set(e.employeeId, new Map());
    namesById.get(e.employeeId)!.set(n, e.name);
    if (!idsByName.has(n)) idsByName.set(n, { name: e.name, ids: new Set() });
    idsByName.get(n)!.ids.add(e.employeeId);
  }
  const byNum = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  return {
    sameIdDifferentNames: [...namesById]
      .filter(([, names]) => names.size > 1)
      .map(([employeeId, names]) => ({ employeeId, names: [...names.values()] }))
      .sort((a, b) => byNum(a.employeeId, b.employeeId)),
    sameNameDifferentIds: [...idsByName.values()]
      .filter((x) => x.ids.size > 1)
      .map((x) => ({ name: x.name, employeeIds: [...x.ids].sort(byNum) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  };
}

export function filePeriod(events: AccessEvent[]): { from: string; to: string; months: string[] } {
  let from = events[0].date;
  let to = events[0].date;
  const months = new Set<string>();
  for (const e of events) {
    if (e.date < from) from = e.date;
    if (e.date > to) to = e.date;
    months.add(e.date.slice(0, 7));
  }
  return { from, to, months: [...months].sort() };
}
