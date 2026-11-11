import { Component, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell, Mark } from './components/AppShell';
import { Button, EmptyState, Notice, Spinner } from './components/ui';
import { api } from './lib/client';
import { AuthProvider, useAuth, useIsAdmin } from './lib/auth';
import { Dashboard } from './pages/Dashboard';
import { EmployeePage } from './pages/EmployeePage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { UploadPage } from './pages/UploadPage';
import { UsersPage } from './pages/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (count, err) => count < 2 && !/прав|Сессия/.test((err as Error).message),
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  if (!api) return <ConfigMissing />;
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider api={api}>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="employee/:id" element={<EmployeePage />} />
                  <Route
                    path="upload"
                    element={
                      <AdminOnly>
                        <UploadPage />
                      </AdminOnly>
                    }
                  />
                  <Route
                    path="history"
                    element={
                      <AdminOnly>
                        <HistoryPage />
                      </AdminOnly>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <AdminOnly>
                        <SettingsPage />
                      </AdminOnly>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <AdminOnly>
                        <UsersPage />
                      </AdminOnly>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
            </Routes>
          </HashRouter>
        </AuthProvider>
      </QueryClientProvider>
      <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'inherit' } }} />
    </ErrorBoundary>
  );
}

function RequireAuth() {
  const { status, error, refresh, api } = useAuth();
  if (status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Проверяю вход…" />
      </div>
    );
  if (status === 'error')
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Notice
          tone="error"
          title="Не удалось подключиться"
          action={
            <div className="flex gap-2">
              <Button onClick={refresh}>Повторить</Button>
              <Button variant="ghost" onClick={() => api.signOut()}>
                Выйти
              </Button>
            </div>
          }
        >
          {error}
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

function AdminOnly({ children }: { children: ReactNode }) {
  const admin = useIsAdmin();
  if (!admin)
    return (
      <EmptyState
        title="Раздел только для администратора"
        action={
          <Link to="/">
            <Button>К табелю</Button>
          </Link>
        }
      >
        У вас доступ на просмотр. Чтобы загружать файлы и менять настройки, нужна роль администратора.
      </EmptyState>
    );
  return <>{children}</>;
}

function NotFound() {
  return (
    <EmptyState
      title="Такой страницы нет"
      action={
        <Link to="/">
          <Button>К табелю</Button>
        </Link>
      }
    >
      Возможно, ссылка устарела.
    </EmptyState>
  );
}

function ConfigMissing() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <Mark className="mb-6 size-10" />
      <Notice tone="error" title="Сайт собран без подключения к базе данных">
        Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Добавьте их в Secrets репозитория на GitHub и запустите
        сборку заново — шаги описаны в README, раздел «Публикация».
      </Notice>
    </div>
  );
}

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
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Notice
          tone="error"
          title="Что-то пошло не так"
          action={<Button onClick={() => location.reload()}>Обновить страницу</Button>}
        >
          Страница столкнулась с ошибкой. Обновите её; если ошибка повторяется, сообщите администратору текст:{' '}
          <code className="break-all">{this.state.error.message}</code>
        </Notice>
      </div>
    );
  }
}
