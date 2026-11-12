import type { Absence, AbsenceStatus, DayFacts, Employee, Holiday, ImportResult, Settings } from '../core';

export type Role = 'admin' | 'rohbar' | 'viewer' | 'korgar';
export const STAFF_ROLES: Role[] = ['admin', 'rohbar', 'viewer'];

export interface Profile {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  /** Для Коргара — его ID в FaceID. */
  employeeId: string | null;
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

export interface PlatformUser {
  id: string;
  email: string;
  login: string;
  fullName: string;
  role: Role;
  employeeId: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  isMe: boolean;
}

export interface NewAbsence {
  date: string;
  fromMinute: number;
  toMinute: number;
  reason: string;
  file: File | null;
  /** Только для админа: отгул за другого сотрудника. */
  employeeId?: string;
}

export interface Credential {
  employeeId: string;
  name: string;
  login: string;
  password: string;
}

export interface Api {
  readonly demo: boolean;
  currentProfile(): Promise<Profile | null>;
  /** Логин — email или ID сотрудника из FaceID. */
  signIn(login: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: (event?: string) => void): () => void;
  /** Письмо со ссылкой для смены пароля (работает после настройки почты в Supabase). */
  requestPasswordReset(email: string): Promise<void>;

  listMonths(): Promise<MonthInfo[]>;
  latestDataDate(): Promise<string | null>;
  listEmployees(): Promise<Employee[]>;
  listDays(from: string, to: string, employeeId?: string): Promise<DayFacts[]>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  importData(fileName: string, data: ImportResult): Promise<number>;
  deleteMonth(month: string): Promise<number>;
  listUploads(): Promise<UploadRecord[]>;
  setEmployeeExcluded(employeeId: string, excluded: boolean, note: string): Promise<void>;

  listHolidays(): Promise<Holiday[]>;
  saveHoliday(h: Holiday): Promise<void>;
  deleteHoliday(date: string): Promise<void>;

  listAbsences(from: string, to: string, employeeId?: string): Promise<Absence[]>;
  createAbsence(a: NewAbsence): Promise<void>;
  reviewAbsence(id: number, status: AbsenceStatus, note: string): Promise<void>;
  deleteAbsence(id: number): Promise<void>;
  /** Временная ссылка на файл подтверждения (действует несколько минут). */
  attachmentUrl(path: string): Promise<string>;

  listUsers(): Promise<PlatformUser[]>;
  createUser(input: {
    email?: string;
    fullName?: string;
    role: Role;
    employeeId?: string;
  }): Promise<{ login: string; password: string }>;
  createKorgarBulk(
    employeeIds: string[],
  ): Promise<{ created: Credential[]; failed: { employeeId: string; error: string }[] }>;
  /** Новые пароли сразу нескольким сотрудникам (только Коргар). */
  resetPasswordsBulk(
    userIds: string[],
  ): Promise<{ created: Credential[]; failed: { employeeId: string; error: string }[] }>;
  setUserRole(userId: string, role: Role): Promise<void>;
  renameUser(userId: string, fullName: string): Promise<void>;
  resetUserPassword(userId: string): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  changeOwnPassword(newPassword: string): Promise<void>;
}

/** Ошибка, понятная пользователю: текст можно показывать как есть. */
export class UserError extends Error {}

export class NoAccessError extends UserError {
  constructor() {
    super('NO_ACCESS');
  }
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Домен служебных email сотрудников (вход по ID). Должен совпадать с KORGAR_LOGIN_DOMAIN в функции admin-users. */
export const KORGAR_DOMAIN = (import.meta.env.VITE_KORGAR_LOGIN_DOMAIN as string | undefined) || 'staff.davomot.tj';

/** «313» → «313@staff.davomot.tj»; email оставляем как есть. */
export const loginToEmail = (login: string) => {
  const v = login.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${KORGAR_DOMAIN}`;
};
