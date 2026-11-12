import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  normalizeSettings,
  type Absence,
  type AbsenceStatus,
  type DayFacts,
  type Employee,
  type Holiday,
  type ImportResult,
  type Settings,
} from '../core';
import {
  NoAccessError,
  UserError,
  loginToEmail,
  type Api,
  type Credential,
  type MonthInfo,
  type NewAbsence,
  type PlatformUser,
  type Profile,
  type Role,
  type UploadRecord,
} from './api';

const PAGE = 1000; // Supabase отдаёт не больше 1000 строк за запрос — читаем страницами.
const BUCKET = 'absence-files';

/** Ошибки → ключи словаря (переводятся на экране) или исходный текст сервера. */
function friendly(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? '';
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) throw new UserError('err.network');
  if (/Invalid path specified|Invalid API key|No API key found/i.test(msg)) throw new UserError('err.config');
  if (error?.code === '42501' || /permission denied|Недостаточно прав/i.test(msg)) throw new UserError('err.forbidden');
  if (/Invalid login credentials/i.test(msg)) throw new UserError('err.badLogin');
  if (/Email not confirmed/i.test(msg)) throw new UserError('err.notConfirmed');
  if (/JWT expired|refresh token/i.test(msg)) throw new UserError('err.sessionExpired');
  if (/timeout|statement timeout/i.test(msg)) throw new UserError('err.timeout');
  if (
    error?.code === '42703' ||
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    /does not exist|Could not find the (function|table)/i.test(msg)
  ) {
    throw new UserError('err.migration');
  }
  if (/rate limit/i.test(msg)) throw new UserError('err.rateLimit');
  if (/not authorized/i.test(msg)) throw new UserError('err.emailNotAuthorized');
  throw new UserError(msg || 'err.unknown');
}

type Rows<T> = { data: T[] | null; error: { message?: string; code?: string } | null };

async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<Rows<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) friendly(error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const mapAbsence = (r: Record<string, unknown>): Absence => ({
  id: r.id as number,
  employeeId: r.employee_id as string,
  date: r.day as string,
  fromMinute: r.from_minute as number,
  toMinute: r.to_minute as number,
  reason: r.reason as string,
  attachmentPath: (r.attachment_path as string | null) ?? null,
  status: r.status as AbsenceStatus,
  reviewNote: (r.review_note as string) ?? '',
  reviewedByName: (r.reviewed_by_name as string) ?? '',
  createdAt: r.created_at as string,
});

export class SupabaseApi implements Api {
  readonly demo = false;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      // PKCE: ссылка из письма приходит как ?code=…, а не #токен — не конфликтует с адресами сайта (#/…).
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'attendance-auth',
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });
  }

  async currentProfile(): Promise<Profile | null> {
    const { data: s, error: se } = await this.sb.auth.getSession();
    if (se) friendly(se);
    const user = s.session?.user;
    if (!user) return null;
    const { data, error } = await this.sb
      .from('profiles')
      .select('user_id, full_name, role, employee_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) friendly(error);
    if (!data) throw new NoAccessError();
    return {
      userId: user.id,
      email: user.email ?? '',
      fullName: data.full_name || user.email || '',
      role: data.role as Role,
      employeeId: data.employee_id ?? null,
    };
  }

  async signIn(login: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email: loginToEmail(login), password });
    if (error) friendly(error);
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  onAuthChange(cb: (event?: string) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY')
        cb(event);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestPasswordReset(email: string) {
    const redirectTo = location.href.split('#')[0].split('?')[0];
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) friendly(error);
  }

  async listMonths(): Promise<MonthInfo[]> {
    const { data, error } = await this.sb.rpc('available_months');
    if (error) friendly(error);
    return (data as { month: string; days: number }[]).map((r) => ({ month: r.month, days: Number(r.days) }));
  }

  async latestDataDate(): Promise<string | null> {
    const { data, error } = await this.sb
      .from('attendance_days')
      .select('day')
      .order('day', { ascending: false })
      .limit(1);
    if (error) friendly(error);
    return data?.[0]?.day ?? null;
  }

  async listEmployees(): Promise<Employee[]> {
    const rows = await pages<Record<string, unknown>>((a, b) =>
      this.sb
        .from('employees')
        .select('employee_id, name, department, excluded, excluded_note')
        .order('employee_id')
        .range(a, b),
    );
    return rows.map((r) => ({
      employeeId: r.employee_id as string,
      name: r.name as string,
      department: r.department as string,
      excluded: !!r.excluded,
      excludedNote: (r.excluded_note as string) ?? '',
    }));
  }

  async listDays(fromDate: string, toDate: string, employeeId?: string): Promise<DayFacts[]> {
    const rows = await pages<Record<string, unknown>>((a, b) => {
      let q = this.sb
        .from('attendance_days')
        .select('employee_id, day, first_in, last_out, events_count, night_ignored')
        .gte('day', fromDate)
        .lte('day', toDate)
        .order('employee_id')
        .order('day')
        .range(a, b);
      if (employeeId) q = q.eq('employee_id', employeeId);
      return q;
    });
    return rows.map((r) => ({
      employeeId: r.employee_id as string,
      date: r.day as string,
      firstIn: r.first_in as number,
      lastOut: (r.last_out as number | null) ?? null,
      eventsCount: r.events_count as number,
      nightIgnored: !!r.night_ignored,
    }));
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.sb.from('app_settings').select('value').eq('id', 1).maybeSingle();
    if (error) friendly(error);
    return normalizeSettings(data?.value);
  }

  async saveSettings(s: Settings) {
    const { data: u } = await this.sb.auth.getUser();
    // Праздники хранятся в отдельной таблице — в настройки их не пишем.
    const { holidays: _h, shortDays: _s, ...value } = s;
    const { data, error } = await this.sb
      .from('app_settings')
      .update({ value, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
      .eq('id', 1)
      .select('id');
    if (error) friendly(error);
    if (!data || data.length === 0) throw new UserError('err.forbidden');
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
    return (data ?? []).map((r) => ({
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

  async setEmployeeExcluded(employeeId: string, excluded: boolean, note: string) {
    const { error } = await this.sb.rpc('set_employee_excluded', {
      p_employee_id: employeeId,
      p_excluded: excluded,
      p_note: note,
    });
    if (error) friendly(error);
  }

  async listHolidays(): Promise<Holiday[]> {
    const { data, error } = await this.sb.from('holidays').select('*').order('day');
    if (error) friendly(error);
    return (data ?? []).map((r) => ({
      date: r.day,
      kind: r.kind,
      endMinute: r.end_minute ?? null,
      name: r.name,
      comment: r.comment ?? '',
    }));
  }

  async saveHoliday(h: Holiday) {
    const { error } = await this.sb.from('holidays').upsert({
      day: h.date,
      kind: h.kind,
      end_minute: h.kind === 'short' ? h.endMinute : null,
      name: h.name.trim(),
      comment: h.comment.trim(),
    });
    if (error) friendly(error);
  }

  async deleteHoliday(date: string) {
    const { error } = await this.sb.from('holidays').delete().eq('day', date);
    if (error) friendly(error);
  }

  async listAbsences(from: string, to: string, employeeId?: string): Promise<Absence[]> {
    const rows = await pages<Record<string, unknown>>((a, b) => {
      let q = this.sb
        .from('absences')
        .select('*')
        .gte('day', from)
        .lte('day', to)
        .order('day', { ascending: false })
        .range(a, b);
      if (employeeId) q = q.eq('employee_id', employeeId);
      return q;
    });
    return rows.map(mapAbsence);
  }

  async createAbsence(a: NewAbsence) {
    let path: string | null = null;
    if (a.file) {
      const owner = a.employeeId ?? (await this.currentProfile())?.employeeId;
      if (!owner) throw new UserError('err.forbidden');
      const ext = (a.file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      path = `${owner}/${crypto.randomUUID()}.${ext}`;
      const { error } = await this.sb.storage
        .from(BUCKET)
        .upload(path, a.file, { contentType: a.file.type, upsert: false });
      if (error) {
        if (/exceeded|too large|size/i.test(error.message)) throw new UserError('err.fileTooLarge');
        if (/mime|type/i.test(error.message)) throw new UserError('err.fileType');
        friendly(error);
      }
    }
    const { error } = await this.sb.rpc('create_absence', {
      p_day: a.date,
      p_from: a.fromMinute,
      p_to: a.toMinute,
      p_reason: a.reason,
      p_attachment: path,
      p_employee_id: a.employeeId ?? null,
    });
    if (error) friendly(error);
  }

  async reviewAbsence(id: number, status: AbsenceStatus, note: string) {
    const { error } = await this.sb.rpc('review_absence', { p_id: id, p_status: status, p_note: note });
    if (error) friendly(error);
  }

  async deleteAbsence(id: number) {
    const { error } = await this.sb.rpc('delete_absence', { p_id: id });
    if (error) friendly(error);
  }

  async attachmentUrl(path: string): Promise<string> {
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) friendly(error);
    return data!.signedUrl;
  }

  /** Вызов серверной функции admin-users с понятными ошибками. */
  private async users<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke('admin-users', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const status = error.context?.status;
        let msg = '';
        try {
          msg = (await error.context.json())?.error ?? '';
        } catch {
          /* ответ не JSON */
        }
        if (status === 404 && !msg) throw new UserError('err.fnMissing');
        if (status === 401 && /Invalid JWT|jwt/i.test(msg || error.message)) throw new UserError('err.fnJwt');
        throw new UserError(msg || 'err.unknown');
      }
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError)
        throw new UserError('err.fnUnreachable');
      friendly(error);
    }
    return data as T;
  }

  async listUsers(): Promise<PlatformUser[]> {
    return (await this.users<{ users: PlatformUser[] }>({ action: 'list' })).users;
  }
  async createUser(input: { email?: string; fullName?: string; role: Role; employeeId?: string }) {
    return this.users<{ login: string; password: string }>({ action: 'create', ...input });
  }
  async createKorgarBulk(employeeIds: string[]) {
    return this.users<{ created: Credential[]; failed: { employeeId: string; error: string }[] }>({
      action: 'createKorgarBulk',
      employeeIds,
    });
  }
  async resetPasswordsBulk(userIds: string[]) {
    return this.users<{ created: Credential[]; failed: { employeeId: string; error: string }[] }>({
      action: 'resetPasswordsBulk',
      userIds,
    });
  }
  async setUserRole(userId: string, role: Role) {
    await this.users({ action: 'setRole', userId, role });
  }
  async renameUser(userId: string, fullName: string) {
    await this.users({ action: 'rename', userId, fullName });
  }
  async resetUserPassword(userId: string) {
    return (await this.users<{ password: string }>({ action: 'resetPassword', userId })).password;
  }
  async deleteUser(userId: string) {
    await this.users({ action: 'delete', userId });
  }
  async changeOwnPassword(newPassword: string) {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) {
      if (/different from the old|same/i.test(error.message)) throw new UserError('err.samePassword');
      if (/weak|short|at least/i.test(error.message)) throw new UserError('err.weakPassword');
      if (/reauthentication|nonce/i.test(error.message)) throw new UserError('err.reauth');
      friendly(error);
    }
  }
}
