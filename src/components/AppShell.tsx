import { NavLink, Outlet, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { CalendarRange, FileUp, History, LogOut, Settings2 } from 'lucide-react';
import { useAuth, useIsAdmin } from '../lib/auth';

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

export function AppShell() {
  const { profile, api } = useAuth();
  const admin = useIsAdmin();
  const [params] = useSearchParams();
  const m = params.get('m');
  const keep = m ? `?m=${m}` : '';

  const nav = [
    { to: `/${keep}`, label: 'Табель', icon: CalendarRange, show: true, end: true },
    { to: '/upload', label: 'Загрузка файла', icon: FileUp, show: admin },
    { to: '/history', label: 'История загрузок', icon: History, show: admin },
    { to: '/settings', label: 'Настройки графика', icon: Settings2, show: admin },
  ].filter((n) => n.show);

  const link = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors',
      isActive ? 'bg-stamp-soft font-medium text-stamp-deep' : 'text-muted hover:bg-hover hover:text-ink',
    );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        Перейти к содержимому
      </a>
      <aside className="sticky top-0 z-30 border-b border-rule bg-surface lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
            <div className="flex items-center gap-2.5">
              <Mark className="size-8 shrink-0" />
              <div className="leading-tight">
                <p className="text-[15px] font-semibold">Учёт времени</p>
                <p className="text-xs text-muted">по камерам FaceID</p>
              </div>
            </div>
            <button
              onClick={() => api.signOut()}
              className="rounded-md p-2 text-muted hover:bg-hover hover:text-ink lg:hidden"
              aria-label="Выйти"
            >
              <LogOut className="size-4" />
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:px-3 lg:pb-0" aria-label="Разделы">
            {nav.map((n) => (
              <NavLink key={n.label} to={n.to} end={n.end} className={link}>
                <n.icon className="size-4 shrink-0" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden border-t border-rule p-4 lg:block">
            <p className="truncate text-sm font-medium" title={profile?.email}>
              {profile?.fullName}
            </p>
            <p className="text-xs text-muted">{admin ? 'Администратор' : 'Только просмотр'}</p>
            {api.demo && <p className="mt-2 text-xs text-single">Демо-режим: данные не сохраняются</p>}
            <button
              onClick={() => api.signOut()}
              className="mt-3 -ml-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden /> Выйти
            </button>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <Outlet />
      </main>
    </div>
  );
}
