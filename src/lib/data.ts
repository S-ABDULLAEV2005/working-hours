import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { evaluateDays, summarize, type DailyRecord, type Employee, type MonthlySummary, type Settings } from '../core';
import { monthRange } from './api';
import { useApi } from './auth';

export const qk = {
  months: ['months'] as const,
  employees: ['employees'] as const,
  settings: ['settings'] as const,
  uploads: ['uploads'] as const,
  days: (month: string) => ['days', month] as const,
};

export function useMonths() {
  const api = useApi();
  return useQuery({ queryKey: qk.months, queryFn: () => api.listMonths() });
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: qk.settings, queryFn: () => api.getSettings() });
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

export interface MonthRow extends MonthlySummary {
  employee: Employee;
  days: DailyRecord[];
  noSchedule: boolean;
}

export interface MonthData {
  rows: MonthRow[];
  departments: string[];
  settings: Settings;
}

/** Все данные месяца: факты из базы + текущие настройки графика → итоги. */
export function useMonthData(month: string | undefined) {
  const api = useApi();
  const emps = useEmployees();
  const settings = useSettings();
  const days = useQuery({
    queryKey: qk.days(month ?? ''),
    enabled: !!month,
    queryFn: () => {
      const { from, to } = monthRange(month!);
      return api.listDays(from, to);
    },
  });

  const data = useMemo<MonthData | undefined>(() => {
    if (!month || !emps.data || !settings.data || !days.data) return undefined;
    const s = settings.data;
    const daily = evaluateDays(days.data, emps.data, s);
    const byEmp = new Map<string, DailyRecord[]>();
    for (const d of daily) {
      const l = byEmp.get(d.employeeId);
      if (l) l.push(d);
      else byEmp.set(d.employeeId, [d]);
    }
    const rows: MonthRow[] = summarize(daily, month).map((m) => {
      const employee = emps.data.get(m.employeeId) ?? {
        employeeId: m.employeeId,
        name: `ID ${m.employeeId}`,
        department: '',
      };
      return {
        ...m,
        employee,
        days: (byEmp.get(m.employeeId) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
        noSchedule: s.noScheduleDepartments.includes(employee.department),
      };
    });
    const departments = [...new Set(rows.map((r) => r.employee.department))].sort((a, b) => a.localeCompare(b, 'ru'));
    return { rows, departments, settings: s };
  }, [month, emps.data, settings.data, days.data]);

  const error = emps.error ?? settings.error ?? days.error;
  return { data, error: error as Error | null, isLoading: !data && !error, refetch: days.refetch };
}
