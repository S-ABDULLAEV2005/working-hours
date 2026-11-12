import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  evaluateDays,
  lowAttendanceThreshold,
  summarize,
  withHolidays,
  type Absence,
  type DailyRecord,
  type Employee,
  type MonthlySummary,
  type Settings,
} from '../core';
import { monthRange } from './api';
import { useApi } from './auth';

export const qk = {
  months: ['months'] as const,
  employees: ['employees'] as const,
  settings: ['settings'] as const,
  holidays: ['holidays'] as const,
  uploads: ['uploads'] as const,
  latest: ['latest'] as const,
  days: (month: string) => ['days', month] as const,
  absences: (month: string) => ['absences', month] as const,
  allAbsences: ['absences'] as const,
};

export function useMonths() {
  const api = useApi();
  return useQuery({ queryKey: qk.months, queryFn: () => api.listMonths() });
}

export function useLatestDate() {
  const api = useApi();
  return useQuery({ queryKey: qk.latest, queryFn: () => api.latestDataDate() });
}

export function useHolidays() {
  const api = useApi();
  return useQuery({ queryKey: qk.holidays, queryFn: () => api.listHolidays() });
}

/** Настройки графика вместе с праздниками из таблицы праздников. */
export function useSettings() {
  const api = useApi();
  const raw = useQuery({ queryKey: qk.settings, queryFn: () => api.getSettings() });
  const hol = useHolidays();
  const data = useMemo(
    () => (raw.data && hol.data ? withHolidays(raw.data, hol.data) : undefined),
    [raw.data, hol.data],
  );
  return {
    data,
    raw: raw.data,
    error: (raw.error ?? hol.error) as Error | null,
    isLoading: !data && !raw.error && !hol.error,
  };
}

export function useEmployees() {
  const api = useApi();
  return useQuery({
    queryKey: qk.employees,
    queryFn: () => api.listEmployees(),
    select: (list) => new Map(list.map((e) => [e.employeeId, e])),
  });
}

export function useUploads() {
  const api = useApi();
  return useQuery({ queryKey: qk.uploads, queryFn: () => api.listUploads() });
}

export function useMonthAbsences(month: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.absences(month ?? ''),
    enabled: !!month,
    queryFn: () => {
      const { from, to } = monthRange(month!);
      return api.listAbsences(from, to);
    },
  });
}

export type Group = 'main' | 'low' | 'excluded';

export interface MonthRow extends MonthlySummary {
  employee: Employee;
  days: DailyRecord[];
  absences: Absence[];
  noSchedule: boolean;
  group: Group;
}

export interface MonthData {
  month: string;
  rows: MonthRow[];
  departments: string[];
  settings: Settings;
  absences: Absence[];
  /** Загруженный период месяца для порога «мало посещений». */
  threshold: { workdays: number; minDays: number };
  dates: string[];
}

/** Все данные месяца: факты из базы + отгулы + текущие настройки графика → итоги. */
export function useMonthData(month: string | undefined) {
  const api = useApi();
  const emps = useEmployees();
  const settings = useSettings();
  const absences = useMonthAbsences(month);
  const days = useQuery({
    queryKey: qk.days(month ?? ''),
    enabled: !!month,
    queryFn: () => {
      const { from, to } = monthRange(month!);
      return api.listDays(from, to);
    },
  });

  const data = useMemo<MonthData | undefined>(() => {
    if (!month || !emps.data || !settings.data || !days.data || !absences.data) return undefined;
    const s = settings.data;
    const daily = evaluateDays(days.data, emps.data, s, absences.data);
    const byEmp = new Map<string, DailyRecord[]>();
    for (const d of daily) {
      const l = byEmp.get(d.employeeId);
      if (l) l.push(d);
      else byEmp.set(d.employeeId, [d]);
    }
    const absByEmp = new Map<string, Absence[]>();
    for (const a of absences.data) {
      const l = absByEmp.get(a.employeeId);
      if (l) l.push(a);
      else absByEmp.set(a.employeeId, [a]);
    }
    const dates = [...new Set(days.data.map((d) => d.date))].sort();
    const threshold = lowAttendanceThreshold(dates, month, s);
    const rows: MonthRow[] = summarize(daily, month, absences.data).map((m) => {
      const employee = emps.data.get(m.employeeId) ?? {
        employeeId: m.employeeId,
        name: `ID ${m.employeeId}`,
        department: '',
      };
      const group: Group = employee.excluded
        ? 'excluded'
        : m.daysPresent + m.absenceDays < threshold.minDays
          ? 'low'
          : 'main';
      return {
        ...m,
        employee,
        days: (byEmp.get(m.employeeId) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
        absences: (absByEmp.get(m.employeeId) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
        noSchedule: s.noScheduleDepartments.includes(employee.department),
        group,
      };
    });
    const departments = [...new Set(rows.map((r) => r.employee.department))].sort((a, b) => a.localeCompare(b, 'ru'));
    return { month, rows, departments, settings: s, absences: absences.data, threshold, dates };
  }, [month, emps.data, settings.data, days.data, absences.data]);

  const error = (emps.error ?? settings.error ?? days.error ?? absences.error) as Error | null;
  return { data, error, isLoading: !data && !error, refetch: days.refetch };
}
