import type {
  AccessEvent,
  DailyRecord,
  DayFacts,
  DayFlag,
  Employee,
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

/** Применяет правила графика к факту дня. */
export function evaluateDay(f: DayFacts, department: string, s: Settings): DailyRecord {
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

  let minutesLate: number | null = null;
  // Одна отметка: неизвестно, приход это или уход — опоздание не начисляем.
  if (!single && !noSchedule && workday) {
    minutesLate = Math.max(0, Math.floor(f.firstIn / 60) - s.shiftStartMinute);
  }

  return { ...f, minutesPresent, minutesLate, flags };
}

export function evaluateDays(facts: DayFacts[], employees: Map<string, Employee>, s: Settings): DailyRecord[] {
  return facts.map((f) => evaluateDay(f, employees.get(f.employeeId)?.department ?? '', s));
}

export function summarize(daily: DailyRecord[], month: string): MonthlySummary[] {
  const byEmp = new Map<string, MonthlySummary>();
  for (const d of daily) {
    if (!d.date.startsWith(month)) continue;
    let m = byEmp.get(d.employeeId);
    if (!m) {
      m = {
        employeeId: d.employeeId,
        month,
        daysPresent: 0,
        minutesPresent: 0,
        lateCount: 0,
        minutesLate: 0,
        singleEventDays: 0,
      };
      byEmp.set(d.employeeId, m);
    }
    m.daysPresent++;
    m.minutesPresent += d.minutesPresent;
    if (d.minutesLate !== null && d.minutesLate > 0) {
      m.lateCount++;
      m.minutesLate += d.minutesLate;
    }
    if (d.lastOut === null) m.singleEventDays++;
  }
  return [...byEmp.values()];
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
