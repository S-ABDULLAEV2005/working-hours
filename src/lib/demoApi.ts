import { DEFAULT_SETTINGS, type DayFacts, type Employee, type ImportResult, type Settings } from '../core';
import { UserError, type Api, type MonthInfo, type Profile, type UploadRecord } from './api';

/**
 * Демо-режим: всё хранится в памяти браузера и пропадает при обновлении страницы.
 * Нужен, чтобы посмотреть платформу без Supabase. Включается VITE_DEMO=1.
 */
const USERS: Record<string, Profile & { password: string }> = {
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
}
