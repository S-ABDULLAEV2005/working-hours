import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Mark } from '../components/AppShell';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Notice } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { api, status, error: authError } = useAuth();
  const { t } = useI18n();
  const errText = useErrorText();
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Вход прошёл, но профиль не прочитался (нет доступа, база не обновлена, нет сети) — показываем причину, а не вечную загрузку.
  useEffect(() => {
    if (status === 'error' || status === 'no-access') setLoading(false);
    if (status === 'error' && authError) setError(errText(new Error(authError)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, authError]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!login.trim() || !password) return setError(t('login.errEmpty'));
    setLoading(true);
    try {
      await api.signIn(login, password);
    } catch (err) {
      setError(errText(err));
      setLoading(false);
    }
  };

  const forgot = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.trim())) return setError(t('login.errEmail'));
    setLoading(true);
    try {
      await api.requestPasswordReset(login);
      setMode('sent');
    } catch (err) {
      setError(errText(err));
    } finally {
      setLoading(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule px-3';

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <Mark className="size-14" />
            <div>
              <h1 className="mt-4 text-2xl font-semibold">{t('app.name')}</h1>
              <p className="text-sm text-muted">{t('login.subtitle')}</p>
            </div>
          </div>

          {status === 'no-access' && (
            <div className="mb-4">
              <Notice tone="warn" title={t('login.noAccessTitle')}>
                {t('login.noAccess')}
              </Notice>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={submit} className="rounded-xl border border-rule bg-surface p-6" noValidate>
              <label className="block text-sm font-medium" htmlFor="login">
                {t('login.login')}
              </label>
              <input
                id="login"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className={field}
                autoFocus
              />
              <p className="mt-1 text-xs text-muted">{t('login.loginHint')}</p>
              <label className="mt-4 block text-sm font-medium" htmlFor="password">
                {t('login.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute top-1.5 right-0 grid h-10 w-10 place-items-center rounded-md text-muted hover:text-ink"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-3 text-sm text-late">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" loading={loading} className="mt-5 h-10 w-full">
                {t('login.submit')}
              </Button>

            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={forgot} className="rounded-xl border border-rule bg-surface p-6" noValidate>
              <h2 className="font-semibold">{t('login.forgotTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('login.forgotHint')}</p>
              <label className="mt-4 block text-sm font-medium" htmlFor="femail">
                Email
              </label>
              <input
                id="femail"
                type="email"
                value={login.includes('@') ? login : ''}
                onChange={(e) => setLogin(e.target.value)}
                className={field}
              />
              {error && (
                <p role="alert" className="mt-3 text-sm text-late">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" loading={loading} className="mt-5 h-10 w-full">
                {t('login.sendLink')}
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="mt-4 text-sm text-stamp hover:underline"
              >
                {t('login.back')}
              </button>
            </form>
          )}

          {mode === 'sent' && (
            <div className="rounded-xl border border-rule bg-surface p-6">
              <Notice tone="ok" title={t('login.sentTitle')}>
                {t('login.sent')}
              </Notice>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="mt-4 text-sm text-stamp hover:underline"
              >
                {t('login.back')}
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-muted">{api.demo ? t('login.demoHint') : t('login.help')}</p>
        </div>
      </div>
    </div>
  );
}
