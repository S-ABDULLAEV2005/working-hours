import { Component, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell, Mark } from './components/AppShell';
import { Button, EmptyState, Notice, Spinner } from './components/ui';
import { I18nProvider, translate, useErrorText, useI18n, type Lang } from './i18n';
import type { Role } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { api } from './lib/client';
import { AbsencesPage } from './pages/AbsencesPage';
import { EmployeeView } from './pages/EmployeeView';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TabelPage } from './pages/TabelPage';
import { TodayPage } from './pages/TodayPage';
import { UploadPage } from './pages/UploadPage';
import { UsersPage } from './pages/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (count, err) => count < 2 && !/^err\.(forbidden|sessionExpired)$/.test((err as Error).message),
      refetchOnWindowFocus: false,
    },
  },
});

const STAFF: Role[] = ['admin', 'rohbar', 'viewer'];

export default function App() {
  return (
    <I18nProvider>
      {!api ? (
        <ConfigMissing />
      ) : (
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider api={api}>
              <HashRouter>
                <Routes>
                  <Route path="/login" element={<LoginRoute />} />
                  <Route element={<RequireAuth />}>
                    <Route element={<AppShell />}>
                      <Route index element={<Home />} />
                      <Route
                        path="me"
                        element={
                          <Only roles={['korgar']}>
                            <EmployeeView mine />
                          </Only>
                        }
                      />
                      <Route
                        path="today"
                        element={
                          <Only roles={STAFF}>
                            <TodayPage />
                          </Only>
                        }
                      />
                      <Route
                        path="tabel"
                        element={
                          <Only roles={STAFF}>
                            <TabelPage />
                          </Only>
                        }
                      />
                      <Route
                        path="employee/:id"
                        element={
                          <Only roles={STAFF}>
                            <EmployeeView />
                          </Only>
                        }
                      />
                      <Route
                        path="absences"
                        element={
                          <Only roles={STAFF}>
                            <AbsencesPage />
                          </Only>
                        }
                      />
                      <Route
                        path="upload"
                        element={
                          <Only roles={['admin']}>
                            <UploadPage />
                          </Only>
                        }
                      />
                      <Route
                        path="history"
                        element={
                          <Only roles={['admin']}>
                            <HistoryPage />
                          </Only>
                        }
                      />
                      <Route
                        path="settings"
                        element={
                          <Only roles={['admin']}>
                            <SettingsPage />
                          </Only>
                        }
                      />
                      <Route
                        path="users"
                        element={
                          <Only roles={['admin']}>
                            <UsersPage />
                          </Only>
                        }
                      />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Route>
                </Routes>
              </HashRouter>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      )}
      <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
    </I18nProvider>
  );
}

/** Стартовая страница зависит от роли. */
function Home() {
  const { profile } = useAuth();
  return <Navigate to={profile?.role === 'korgar' ? '/me' : '/today'} replace />;
}

function RequireAuth() {
  const { status, error, refresh, api } = useAuth();
  const { t } = useI18n();
  const errText = useErrorText();
  if (status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label={t('auth.checking')} />
      </div>
    );
  if (status === 'error')
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Notice
          tone="error"
          title={t('auth.connectFailed')}
          action={
            <div className="flex gap-2">
              <Button onClick={refresh}>{t('common.retry')}</Button>
              <Button variant="ghost" onClick={() => api.signOut()}>
                {t('nav.logout')}
              </Button>
            </div>
          }
        >
          {errText(new Error(error ?? ''))}
        </Notice>
      </div>
    );
  if (status !== 'signed-in') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function LoginRoute() {
  const { status } = useAuth();
  if (status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  if (status === 'signed-in') return <Navigate to="/" replace />;
  return <LoginPage />;
}

function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  const { t } = useI18n();
  if (!profile || !roles.includes(profile.role))
    return (
      <EmptyState
        title={t('auth.noRights')}
        action={
          <Link to="/">
            <Button>{t('auth.toHome')}</Button>
          </Link>
        }
      >
        {t('auth.noRightsHint')}
      </EmptyState>
    );
  return <>{children}</>;
}

function NotFound() {
  const { t } = useI18n();
  return (
    <EmptyState
      title={t('auth.notFound')}
      action={
        <Link to="/">
          <Button>{t('auth.toHome')}</Button>
        </Link>
      }
    >
      {t('auth.notFoundHint')}
    </EmptyState>
  );
}

function ConfigMissing() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <Mark className="mb-6 size-10" />
      <Notice tone="error" title={t('cfg.title')}>
        {t('cfg.hint')}
      </Notice>
    </div>
  );
}

const savedLang = (): Lang => {
  try {
    const v = localStorage.getItem('davomot-lang');
    if (v === 'ru' || v === 'en' || v === 'tj') return v;
  } catch {
    /* ignore */
  }
  return 'ru';
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const l = savedLang();
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Notice
          tone="error"
          title={translate(l, 'crash.title')}
          action={<Button onClick={() => location.reload()}>{translate(l, 'crash.reload')}</Button>}
        >
          {translate(l, 'crash.hint')} <code className="break-all">{this.state.error.message}</code>
        </Notice>
      </div>
    );
  }
}
