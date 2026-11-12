import { useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router';
import clsx from 'clsx';
import {
  CalendarRange,
  FileUp,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings2,
  User,
  Users,
} from 'lucide-react';
import { useI18n, type DictKey } from '../i18n';
import type { Role } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { LangSwitch } from './LangSwitch';

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#3A3E9C" />
      <g fill="#fff">
        <rect x="7" y="9" width="4" height="4" rx="1" />
        <rect x="14" y="9" width="4" height="4" rx="1" />
        <rect x="21" y="9" width="4" height="4" rx="1" opacity=".45" />
        <rect x="7" y="16" width="4" height="4" rx="1" />
        <rect x="14" y="16" width="4" height="4" rx="1" fill="#F2A79F" />
        <rect x="21" y="16" width="4" height="4" rx="1" />
        <rect x="7" y="23" width="4" height="4" rx="1" opacity=".45" />
        <rect x="14" y="23" width="4" height="4" rx="1" />
      </g>
    </svg>
  );
}

const ROLE_LABEL: Record<Role, DictKey> = {
  admin: 'role.admin',
  rohbar: 'role.rohbar',
  viewer: 'role.viewer',
  korgar: 'role.korgar',
};

export function AppShell() {
  const { profile, api, recovery, clearRecovery } = useAuth();
  const { t } = useI18n();
  const role = profile?.role ?? 'viewer';
  const [params] = useSearchParams();
  const m = params.get('m');
  const keep = m ? `?m=${m}` : '';
  const [pwOpen, setPwOpen] = useState(false);

  const nav = [
    { to: '/me' + keep, label: t('nav.me'), icon: User, roles: ['korgar'] },
    { to: '/today', label: t('nav.today'), icon: LayoutDashboard, roles: ['admin', 'rohbar', 'viewer'] },
    { to: '/tabel' + keep, label: t('nav.tabel'), icon: CalendarRange, roles: ['admin', 'rohbar', 'viewer'] },
    { to: '/absences', label: t('nav.absences'), icon: Inbox, roles: ['admin', 'rohbar', 'viewer'] },
    { to: '/upload', label: t('nav.upload'), icon: FileUp, roles: ['admin'] },
    { to: '/history', label: t('nav.history'), icon: History, roles: ['admin'] },
    { to: '/settings', label: t('nav.settings'), icon: Settings2, roles: ['admin'] },
    { to: '/users', label: t('nav.users'), icon: Users, roles: ['admin'] },
  ].filter((n) => n.roles.includes(role));

  const link = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
      isActive ? 'bg-stamp-soft font-medium text-stamp-deep' : 'text-muted hover:bg-hover hover:text-ink',
    );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        {t('a11y.skip')}
      </a>
      <aside className="sticky top-0 z-30 border-b border-rule bg-surface lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
            <div className="flex items-center gap-2.5">
              <Mark className="size-8 shrink-0" />
              <div className="leading-tight">
                <p className="text-[15px] font-semibold">{t('app.short')}</p>
                <p className="text-xs text-muted">{t('app.tagline')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 lg:hidden">
              <LangSwitch />
              <button
                onClick={() => setPwOpen(true)}
                className="rounded-md p-2 text-muted hover:bg-hover hover:text-ink"
                aria-label={t('pw.title')}
              >
                <KeyRound className="size-4" />
              </button>
              <button
                onClick={() => api.signOut()}
                className="rounded-md p-2 text-muted hover:bg-hover hover:text-ink"
                aria-label={t('nav.logout')}
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:pb-0" aria-label={t('a11y.nav')}>
            {nav.map((n) => (
              <NavLink key={n.label} to={n.to} className={link}>
                <n.icon className="size-4 shrink-0" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden border-t border-rule p-4 lg:block">
            <p className="truncate text-sm font-medium" title={profile?.email}>
              {profile?.fullName}
            </p>
            <p className="text-xs text-muted">
              {t(ROLE_LABEL[role])}
              {role === 'korgar' && profile?.employeeId && ` · ID ${profile.employeeId}`}
            </p>
            {api.demo && <p className="mt-2 text-xs text-single">{t('app.demo')}</p>}
            <div className="mt-3 -ml-2 flex flex-col items-start">
              <button
                onClick={() => setPwOpen(true)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-ink"
              >
                <KeyRound className="size-4" aria-hidden /> {t('pw.title')}
              </button>
              <button
                onClick={() => api.signOut()}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-ink"
              >
                <LogOut className="size-4" aria-hidden /> {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="hidden justify-end px-10 pt-5 lg:flex">
          <LangSwitch />
        </div>
        <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:pt-2 lg:pb-9">
          <Outlet />
        </main>
      </div>
      <ChangePasswordDialog
        open={pwOpen || recovery}
        recovery={recovery}
        onClose={() => (recovery ? clearRecovery() : setPwOpen(false))}
      />
    </div>
  );
}
