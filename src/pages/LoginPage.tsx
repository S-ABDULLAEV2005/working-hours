import { useState, type FormEvent } from 'react';
import { Mark } from '../components/AppShell';
import { Button, Notice } from '../components/ui';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { api, status, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Введите email и пароль.');
      return;
    }
    setLoading(true);
    try {
      await api.signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-3">
          <Mark className="size-10" />
          <div>
            <h1 className="text-xl font-semibold">Учёт рабочего времени</h1>
            <p className="text-sm text-muted">Вход для сотрудников, которым выдан доступ</p>
          </div>
        </div>

        {status === 'no-access' && (
          <div className="mb-4">
            <Notice tone="warn" title="Доступ не выдан">
              {authError}
            </Notice>
          </div>
        )}

        <form onSubmit={submit} className="rounded-xl border border-rule bg-surface p-6" noValidate>
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-md border border-rule px-3"
            autoFocus
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-md border border-rule px-3"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-late">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={loading} className="mt-5 h-10 w-full">
            Войти
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted">
          {api.demo ? (
            <>Демо-режим. Администратор: admin@demo, наблюдатель: viewer@demo, пароль demo.</>
          ) : (
            <>Забыли пароль или нет доступа — обратитесь к администратору платформы.</>
          )}
        </p>
      </div>
    </div>
  );
}
