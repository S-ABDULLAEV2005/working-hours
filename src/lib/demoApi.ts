import { DEFAULT_SETTINGS, type DayFacts, type Employee, type ImportResult, type Settings } from '../core';
import {
  UserError,
  type Api,
  type MonthInfo,
  type PlatformUser,
  type Profile,
  type Role,
  type UploadRecord,
} from './api';

/**
 * Демо-режим: всё хранится в памяти браузера и пропадает при обновлении страницы.
 * Нужен, чтобы посмотреть платформу без Supabase. Включается VITE_DEMO=1.
 */
const USERS: Record<string, Profile & { password: string; createdAt?: string; lastSignInAt?: string | null }> = {
  'admin@demo': { userId: 'a', email: 'admin@demo', fullName: 'Администратор (демо)', role: 'admin', password: 'demo' },
  'viewer@demo': {
    userId: 'v',
    email: 'viewer@demo',
    fullName: 'Наблюдатель (демо)',
    role: 'viewer',
    password: 'demo',
  },
};

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export class DemoApi implements Api {
  readonly demo = true;
  private me: Profile | null = null;
  private listeners = new Set<() => void>();
  private employees = new Map<string, Employee>();
  private days = new Map<string, DayFacts>();
  private uploads: UploadRecord[] = [];
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);

  constructor() {
    try {
      const saved = sessionStorage.getItem('demo-user');
      if (saved && USERS[saved]) this.me = USERS[saved];
    } catch {
      /* хранилище недоступно — просто без запоминания */
    }
  }

  private requireAdmin() {
    if (this.me?.role !== 'admin') throw new UserError('Недостаточно прав для этого действия.');
  }

  async currentProfile() {
    await wait(50);
    return this.me;
  }
  async signIn(email: string, password: string) {
    await wait(300);
    const u = USERS[email.trim().toLowerCase()];
    if (!u || u.password !== password) throw new UserError('Неверный email или пароль.');
    this.me = u;
    try {
      sessionStorage.setItem('demo-user', u.email);
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l());
  }
  async signOut() {
    this.me = null;
    try {
      sessionStorage.removeItem('demo-user');
    } catch {
      /* ignore */
    }
    this.listeners.forEach((l) => l());
  }
  onAuthChange(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  async listMonths(): Promise<MonthInfo[]> {
    await wait();
    const counts = new Map<string, number>();
    for (const d of this.days.values()) counts.set(d.date.slice(0, 7), (counts.get(d.date.slice(0, 7)) ?? 0) + 1);
    return [...counts].map(([month, days]) => ({ month, days })).sort((a, b) => b.month.localeCompare(a.month));
  }
  async listEmployees() {
    await wait();
    return [...this.employees.values()];
  }
  async listDays(from: string, to: string, employeeId?: string) {
    await wait();
    return [...this.days.values()].filter(
      (d) => d.date >= from && d.date <= to && (!employeeId || d.employeeId === employeeId),
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
    for (const e of d.employees) this.employees.set(e.employeeId, e);
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
    return [...this.uploads];
  }

  private genPassword() {
    const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => a[b % a.length]).join('');
  }
  async listUsers(): Promise<PlatformUser[]> {
    this.requireAdmin();
    await wait();
    return Object.values(USERS).map((u) => ({
      id: u.userId,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      createdAt: u.createdAt ?? '2026-11-11T09:00:00Z',
      lastSignInAt: u.lastSignInAt ?? null,
      isMe: u.userId === this.me?.userId,
    }));
  }
  async createUser({ email, fullName, role }: { email: string; fullName: string; role: Role }) {
    this.requireAdmin();
    await wait(400);
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new UserError('Неверный формат email.');
    if (!fullName.trim()) throw new UserError('Не заполнено поле «ФИО».');
    if (USERS[e]) throw new UserError('Пользователь с таким email уже существует.');
    const password = this.genPassword();
    USERS[e] = {
      userId: crypto.randomUUID(),
      email: e,
      fullName: fullName.trim(),
      role,
      password,
      createdAt: new Date().toISOString(),
    };
    return { email: e, password };
  }
  private byId(id: string) {
    const u = Object.values(USERS).find((x) => x.userId === id);
    if (!u) throw new UserError('Пользователь не найден.');
    if (u.userId === this.me?.userId) throw new UserError('Это действие нельзя выполнить со своей учётной записью.');
    return u;
  }
  async setUserRole(id: string, role: Role) {
    this.requireAdmin();
    await wait();
    this.byId(id).role = role;
  }
  async renameUser(id: string, fullName: string) {
    this.requireAdmin();
    await wait();
    const u = Object.values(USERS).find((x) => x.userId === id);
    if (u) u.fullName = fullName.trim();
  }
  async resetUserPassword(id: string) {
    this.requireAdmin();
    await wait(300);
    const u = this.byId(id);
    u.password = this.genPassword();
    return u.password;
  }
  async deleteUser(id: string) {
    this.requireAdmin();
    await wait(300);
    delete USERS[this.byId(id).email];
  }
  async changeOwnPassword(newPassword: string) {
    await wait(300);
    if (!this.me) throw new UserError('Войдите заново.');
    const u = USERS[this.me.email];
    if (u.password === newPassword) throw new UserError('Новый пароль должен отличаться от старого.');
    u.password = newPassword;
  }
}
