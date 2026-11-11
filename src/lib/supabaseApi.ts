import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeSettings, type DayFacts, type Employee, type ImportResult, type Settings } from '../core';
import { NoAccessError, UserError, type Api, type MonthInfo, type Profile, type UploadRecord } from './api';

const PAGE = 1000; // Supabase отдаёт не больше 1000 строк за запрос — читаем страницами.

function friendly(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? 'Неизвестная ошибка';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
    throw new UserError('Нет связи с сервером. Проверьте интернет и обновите страницу.');
  }
  if (error?.code === '42501' || /только администратор|permission denied/i.test(msg)) {
    throw new UserError('Недостаточно прав для этого действия.');
  }
  if (/Invalid login credentials/i.test(msg)) throw new UserError('Неверный email или пароль.');
  if (/Email not confirmed/i.test(msg)) throw new UserError('Email не подтверждён. Обратитесь к администратору.');
  if (/JWT expired|refresh token/i.test(msg)) throw new UserError('Сессия истекла. Войдите заново.');
  if (/timeout|statement timeout/i.test(msg)) throw new UserError('Сервер не успел ответить. Попробуйте ещё раз.');
  throw new UserError(msg);
}

export class SupabaseApi implements Api {
  readonly demo = false;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'attendance-auth' },
    });
  }

  async currentProfile(): Promise<Profile | null> {
    const { data: s, error: se } = await this.sb.auth.getSession();
    if (se) friendly(se);
    const user = s.session?.user;
    if (!user) return null;
    const { data, error } = await this.sb
      .from('profiles')
      .select('user_id, full_name, role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) friendly(error);
    if (!data) throw new NoAccessError();
    return { userId: user.id, email: user.email ?? '', fullName: data.full_name || user.email || '', role: data.role };
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) friendly(error);
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  onAuthChange(cb: () => void) {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') cb();
    });
    return () => data.subscription.unsubscribe();
  }

  async listMonths(): Promise<MonthInfo[]> {
    const { data, error } = await this.sb.rpc('available_months');
    if (error) friendly(error);
    return (data as { month: string; days: number }[]).map((r) => ({ month: r.month, days: Number(r.days) }));
  }

  async listEmployees(): Promise<Employee[]> {
    const out: Employee[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb
        .from('employees')
        .select('employee_id, name, department')
        .order('employee_id')
        .range(from, from + PAGE - 1);
      if (error) friendly(error);
      out.push(...data.map((r) => ({ employeeId: r.employee_id, name: r.name, department: r.department })));
      if (data.length < PAGE) return out;
    }
  }

  async listDays(fromDate: string, toDate: string, employeeId?: string): Promise<DayFacts[]> {
    const out: DayFacts[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb
        .from('attendance_days')
        .select('employee_id, day, first_in, last_out, events_count, night_ignored')
        .gte('day', fromDate)
        .lte('day', toDate)
        .order('employee_id')
        .order('day')
        .range(from, from + PAGE - 1);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) friendly(error);
      out.push(
        ...data.map((r) => ({
          employeeId: r.employee_id,
          date: r.day,
          firstIn: r.first_in,
          lastOut: r.last_out,
          eventsCount: r.events_count,
          nightIgnored: r.night_ignored,
        })),
      );
      if (data.length < PAGE) return out;
    }
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.sb.from('app_settings').select('value').eq('id', 1).maybeSingle();
    if (error) friendly(error);
    return normalizeSettings(data?.value);
  }

  async saveSettings(s: Settings) {
    const { data: u } = await this.sb.auth.getUser();
    const { data, error } = await this.sb
      .from('app_settings')
      .update({ value: s, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
      .eq('id', 1)
      .select('id');
    if (error) friendly(error);
    if (!data || data.length === 0) throw new UserError('Недостаточно прав для изменения настроек.');
  }

  async importData(fileName: string, d: ImportResult): Promise<number> {
    const { data, error } = await this.sb.rpc('import_attendance', {
      payload: {
        fileName,
        periodFrom: d.period.from,
        periodTo: d.period.to,
        rowsTotal: d.totalRows,
        issuesTotal: d.issues.length,
        employees: d.employees,
        days: d.days,
      },
    });
    if (error) friendly(error);
    return data as number;
  }

  async deleteMonth(month: string): Promise<number> {
    const { data, error } = await this.sb.rpc('delete_month', { p_month: `${month}-01` });
    if (error) friendly(error);
    return data as number;
  }

  async listUploads(): Promise<UploadRecord[]> {
    const { data, error } = await this.sb
      .from('uploads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) friendly(error);
    return data.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      rowsTotal: r.rows_total,
      daysTotal: r.days_total,
      employeesTotal: r.employees_total,
      issuesTotal: r.issues_total,
      uploadedByName: r.uploaded_by_name,
      createdAt: r.created_at,
    }));
  }
}
