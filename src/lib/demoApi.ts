import {
  DEFAULT_SETTINGS,
  type Absence,
  type AbsenceStatus,
  type DayFacts,
  type Employee,
  type Holiday,
  type ImportResult,
  type Settings,
} from '../core';
import {
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

/**
 * Демо-режим: всё хранится в памяти браузера и пропадает при обновлении страницы.
 * Нужен, чтобы посмотреть платформу без Supabase. Включается VITE_DEMO=1.
 */
type DemoUser = Profile & { password: string; createdAt: string; lastSignInAt: string | null };

const mk = (email: string, fullName: string, role: Role, employeeId: string | null = null): DemoUser => ({
  userId: crypto.randomUUID(),
  email,
  fullName,
  role,
  employeeId,
  password: 'demo',
  createdAt: '2026-11-11T09:00:00Z',
  lastSignInAt: null,
});

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const genPassword = () => {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => a[b % a.length]).join('');
};

export class DemoApi implements Api {
  readonly demo = true;
  private users = new Map<string, DemoUser>(
    [
      mk('admin@demo', 'Администратор (демо)', 'admin'),
      mk('rohbar@demo', 'Рохбар (демо)', 'rohbar'),
      mk('viewer@demo', 'Наблюдатель (демо)', 'viewer'),
      mk(loginToEmail('313'), 'Коргар 313 (демо)', 'korgar', '313'),
    ].map((u) => [u.email, u]),
  );
  private me: DemoUser | null = null;
  private listeners = new Set<(e?: string) => void>();
  private employees = new Map<string, Employee>();
  private days = new Map<string, DayFacts>();
  private uploads: UploadRecord[] = [];
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);
  private holidays = new Map<string, Holiday>([
    [
      '2026-09-09',
      {
        date: '2026-09-09',
        kind: 'holiday',
        endMinute: null,
        name: 'Рӯзи Истиқлолият',
        comment: 'День независимости Республики Таджикистан',
      },
    ],
    [
      '2026-11-06',
      {
        date: '2026-11-06',
        kind: 'holiday',
        endMinute: null,
        name: 'Рӯзи Конститутсия',
        comment: 'День Конституции Республики Таджикистан',
      },
    ],
  ]);
  private absences: Absence[] = [];
  private files = new Map<string, string>();
  private seq = 1;

  constructor() {
    try {
      const saved = sessionStorage.getItem('demo-user');
      if (saved && this.users.has(saved)) this.me = this.users.get(saved)!;
    } catch {
      /* без запоминания */
    }
  }

  private emit(e?: string) {
    this.listeners.forEach((l) => l(e));
  }
  private requireAdmin() {
    if (this.me?.role !== 'admin') throw new UserError('err.forbidden');
  }
  private isStaff() {
    return !!this.me && this.me.role !== 'korgar';
  }
  private visible(employeeId: string) {
    return this.isStaff() || this.me?.employeeId === employeeId;
  }

  async currentProfile() {
    await wait(50);
    if (!this.me) return null;
    const { password: _p, createdAt: _c, lastSignInAt: _l, ...p } = this.me;
    return p;
  }
  async signIn(login: string, password: string) {
    await wait(300);
    const u = this.users.get(loginToEmail(login));
    if (!u || u.password !== password) throw new UserError('err.badLogin');
    u.lastSignInAt = new Date().toISOString();
    this.me = u;
    try {
      sessionStorage.setItem('demo-user', u.email);
    } catch {
      /* ignore */
    }
    this.emit('SIGNED_IN');
  }
  async signOut() {
    this.me = null;
    try {
      sessionStorage.removeItem('demo-user');
    } catch {
      /* ignore */
    }
    this.emit('SIGNED_OUT');
  }
  onAuthChange(cb: (e?: string) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
  async requestPasswordReset() {
    await wait(300);
  }

  async listMonths(): Promise<MonthInfo[]> {
    await wait();
    const counts = new Map<string, number>();
    for (const d of this.days.values()) {
      if (!this.visible(d.employeeId)) continue;
      counts.set(d.date.slice(0, 7), (counts.get(d.date.slice(0, 7)) ?? 0) + 1);
    }
    return [...counts].map(([month, days]) => ({ month, days })).sort((a, b) => b.month.localeCompare(a.month));
  }
  async latestDataDate() {
    await wait(50);
    let max: string | null = null;
    for (const d of this.days.values()) if (this.visible(d.employeeId) && (!max || d.date > max)) max = d.date;
    return max;
  }
  async listEmployees() {
    await wait();
    return [...this.employees.values()].filter((e) => this.visible(e.employeeId)).map((e) => ({ ...e }));
  }
  async listDays(from: string, to: string, employeeId?: string) {
    await wait();
    return [...this.days.values()].filter(
      (d) =>
        d.date >= from && d.date <= to && (!employeeId || d.employeeId === employeeId) && this.visible(d.employeeId),
    );
  }
  async getSettings() {
    await wait(50);
    return structuredClone(this.settings);
  }
  async saveSettings(s: Settings) {
    this.requireAdmin();
    await wait(250);
    this.settings = structuredClone(s);
  }
  async importData(fileName: string, d: ImportResult) {
    this.requireAdmin();
    await wait(600);
    for (const e of d.employees) {
      const prev = this.employees.get(e.employeeId);
      this.employees.set(e.employeeId, {
        ...e,
        excluded: prev?.excluded ?? false,
        excludedNote: prev?.excludedNote ?? '',
      });
    }
    for (const [k, v] of this.days) if (v.date >= d.period.from && v.date <= d.period.to) this.days.delete(k);
    for (const day of d.days) this.days.set(`${day.employeeId}|${day.date}`, day);
    const id = this.uploads.length + 1;
    this.uploads.unshift({
      id,
      fileName,
      periodFrom: d.period.from,
      periodTo: d.period.to,
      rowsTotal: d.totalRows,
      daysTotal: d.days.length,
      employeesTotal: d.employees.length,
      issuesTotal: d.issues.length,
      uploadedByName: this.me?.fullName ?? '',
      createdAt: new Date().toISOString(),
    });
    return id;
  }
  async deleteMonth(month: string) {
    this.requireAdmin();
    await wait(300);
    let n = 0;
    for (const [k, v] of this.days)
      if (v.date.startsWith(month)) {
        this.days.delete(k);
        n++;
      }
    return n;
  }
  async listUploads() {
    await wait();
    return this.isStaff() ? [...this.uploads] : [];
  }
  async setEmployeeExcluded(employeeId: string, excluded: boolean, note: string) {
    this.requireAdmin();
    await wait();
    const e = this.employees.get(employeeId);
    if (e) Object.assign(e, { excluded, excludedNote: note });
  }

  async listHolidays() {
    await wait(50);
    return [...this.holidays.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  async saveHoliday(h: Holiday) {
    this.requireAdmin();
    await wait();
    this.holidays.set(h.date, { ...h, endMinute: h.kind === 'short' ? h.endMinute : null });
  }
  async deleteHoliday(date: string) {
    this.requireAdmin();
    await wait();
    this.holidays.delete(date);
  }

  async listAbsences(from: string, to: string, employeeId?: string) {
    await wait();
    return this.absences
      .filter(
        (a) =>
          a.date >= from && a.date <= to && (!employeeId || a.employeeId === employeeId) && this.visible(a.employeeId),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((a) => ({ ...a }));
  }
  async createAbsence(a: NewAbsence) {
    await wait(400);
    const emp = this.me?.role === 'admin' && a.employeeId ? a.employeeId : this.me?.employeeId;
    if (!emp) throw new UserError('err.forbidden');
    if (a.toMinute <= a.fromMinute) throw new UserError('err.timeOrder');
    if (a.reason.trim().length < 3) throw new UserError('err.reasonRequired');
    let path: string | null = null;
    if (a.file) {
      if (a.file.size > 5 * 1024 * 1024) throw new UserError('err.fileTooLarge');
      path = `${emp}/${crypto.randomUUID()}`;
      this.files.set(path, URL.createObjectURL(a.file));
    }
    this.absences.push({
      id: this.seq++,
      employeeId: emp,
      date: a.date,
      fromMinute: a.fromMinute,
      toMinute: a.toMinute,
      reason: a.reason.trim(),
      attachmentPath: path,
      status: 'new',
      reviewNote: '',
      reviewedByName: '',
      createdAt: new Date().toISOString(),
    });
  }
  async reviewAbsence(id: number, status: AbsenceStatus, note: string) {
    await wait();
    if (this.me?.role !== 'admin' && this.me?.role !== 'rohbar') throw new UserError('err.forbidden');
    if (status === 'rejected' && note.trim().length < 3) throw new UserError('err.rejectReason');
    const a = this.absences.find((x) => x.id === id);
    if (a) Object.assign(a, { status, reviewNote: note, reviewedByName: this.me.fullName });
  }
  async deleteAbsence(id: number) {
    await wait();
    const a = this.absences.find((x) => x.id === id);
    if (!a || !(this.me?.role === 'admin' || (a.employeeId === this.me?.employeeId && a.status === 'new'))) {
      throw new UserError('err.forbidden');
    }
    this.absences = this.absences.filter((x) => x.id !== id);
  }
  async attachmentUrl(path: string) {
    return this.files.get(path) ?? '';
  }

  async listUsers(): Promise<PlatformUser[]> {
    this.requireAdmin();
    await wait();
    return [...this.users.values()].map((u) => ({
      id: u.userId,
      email: u.email,
      login: u.role === 'korgar' && u.employeeId ? u.employeeId : u.email,
      fullName: u.fullName,
      role: u.role,
      employeeId: u.employeeId,
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      isMe: u.userId === this.me?.userId,
    }));
  }
  private createKorgar(employeeId: string): Credential {
    const emp = this.employees.get(employeeId);
    if (!emp) throw new UserError(`ID ${employeeId}: сотрудник не найден`);
    if ([...this.users.values()].some((u) => u.employeeId === employeeId))
      throw new UserError(`ID ${employeeId}: аккаунт уже есть`);
    const password = genPassword();
    const u = mk(loginToEmail(employeeId), emp.name, 'korgar', employeeId);
    u.password = password;
    u.createdAt = new Date().toISOString();
    this.users.set(u.email, u);
    return { employeeId, name: emp.name, login: employeeId, password };
  }
  async createUser({
    email,
    fullName,
    role,
    employeeId,
  }: {
    email?: string;
    fullName?: string;
    role: Role;
    employeeId?: string;
  }) {
    this.requireAdmin();
    await wait(400);
    if (role === 'korgar') {
      const c = this.createKorgar(employeeId ?? '');
      return { login: c.login, password: c.password };
    }
    const e = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new UserError('err.emailFormat');
    if (!fullName?.trim()) throw new UserError('err.nameRequired');
    if (this.users.has(e)) throw new UserError('err.userExists');
    const u = mk(e, fullName.trim(), role);
    u.password = genPassword();
    u.createdAt = new Date().toISOString();
    this.users.set(e, u);
    return { login: e, password: u.password };
  }
  async createKorgarBulk(ids: string[]) {
    this.requireAdmin();
    await wait(600);
    const created: Credential[] = [];
    const failed: { employeeId: string; error: string }[] = [];
    for (const id of ids) {
      try {
        created.push(this.createKorgar(id));
      } catch (e) {
        failed.push({ employeeId: id, error: (e as Error).message });
      }
    }
    return { created, failed };
  }
  async resetPasswordsBulk(userIds: string[]) {
    this.requireAdmin();
    await wait(400);
    const created: Credential[] = [];
    const failed: { employeeId: string; error: string }[] = [];
    for (const id of userIds) {
      const u = [...this.users.values()].find((x) => x.userId === id);
      if (!u || u.role !== 'korgar' || !u.employeeId) {
        failed.push({ employeeId: id, error: 'Не сотрудник (Коргар).' });
        continue;
      }
      u.password = genPassword();
      created.push({ employeeId: u.employeeId, name: u.fullName, login: u.employeeId, password: u.password });
    }
    return { created, failed };
  }
  private byId(id: string) {
    const u = [...this.users.values()].find((x) => x.userId === id);
    if (!u) throw new UserError('err.unknown');
    if (u.userId === this.me?.userId) throw new UserError('err.notSelf');
    return u;
  }
  async setUserRole(id: string, role: Role) {
    this.requireAdmin();
    await wait();
    const u = this.byId(id);
    if (u.role === 'korgar' || role === 'korgar') throw new UserError('err.korgarRole');
    u.role = role;
  }
  async renameUser(id: string, fullName: string) {
    this.requireAdmin();
    await wait();
    const u = [...this.users.values()].find((x) => x.userId === id);
    if (u) u.fullName = fullName.trim();
  }
  async resetUserPassword(id: string) {
    this.requireAdmin();
    await wait(300);
    const u = this.byId(id);
    u.password = genPassword();
    return u.password;
  }
  async deleteUser(id: string) {
    this.requireAdmin();
    await wait(300);
    this.users.delete(this.byId(id).email);
  }
  async changeOwnPassword(newPassword: string) {
    await wait(300);
    if (!this.me) throw new UserError('err.sessionExpired');
    if (this.me.password === newPassword) throw new UserError('err.samePassword');
    this.me.password = newPassword;
  }
}
