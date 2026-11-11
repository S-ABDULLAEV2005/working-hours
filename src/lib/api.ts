import type { DayFacts, Employee, ImportResult, Settings } from '../core';

export type Role = 'admin' | 'viewer';

export interface Profile {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface MonthInfo {
  month: string; // YYYY-MM
  days: number;
}

export interface UploadRecord {
  id: number;
  fileName: string;
  periodFrom: string;
  periodTo: string;
  rowsTotal: number;
  daysTotal: number;
  employeesTotal: number;
  issuesTotal: number;
  uploadedByName: string;
  createdAt: string;
}

export interface Api {
  readonly demo: boolean;
  /** Текущий пользователь или null. Бросает ошибку, если вход есть, а доступа нет. */
  currentProfile(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;

  listMonths(): Promise<MonthInfo[]>;
  listEmployees(): Promise<Employee[]>;
  listDays(from: string, to: string, employeeId?: string): Promise<DayFacts[]>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  importData(fileName: string, data: ImportResult): Promise<number>;
  deleteMonth(month: string): Promise<number>;
  listUploads(): Promise<UploadRecord[]>;
}

/** Ошибка, понятная пользователю: текст можно показывать как есть. */
export class UserError extends Error {}

export class NoAccessError extends UserError {
  constructor() {
    super('Вход выполнен, но доступ к платформе не выдан. Обратитесь к администратору.');
  }
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
