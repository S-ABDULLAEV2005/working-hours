import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Api, Profile, Role } from './api';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'no-access' | 'error';
  profile: Profile | null;
  error: string | null;
  /** Пользователь пришёл по ссылке «сменить пароль» из письма. */
  recovery: boolean;
  clearRecovery: () => void;
  api: Api;
  refresh: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ api, children }: { api: Api; children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<{ status: AuthState['status']; profile: Profile | null; error: string | null }>({
    status: 'loading',
    profile: null,
    error: null,
  });
  const [recovery, setRecovery] = useState(false);

  const refresh = useCallback(() => {
    api
      .currentProfile()
      .then((p) => setState({ status: p ? 'signed-in' : 'signed-out', profile: p, error: null }))
      .catch((e: Error) =>
        setState({ status: e.message === 'NO_ACCESS' ? 'no-access' : 'error', profile: null, error: e.message }),
      );
  }, [api]);

  useEffect(() => {
    refresh();
    return api.onAuthChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      qc.clear(); // данные другого пользователя не должны остаться в кэше
      refresh();
    });
  }, [api, qc, refresh]);

  return (
    <Ctx.Provider value={{ ...state, recovery, clearRecovery: () => setRecovery(false), api, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth вне AuthProvider');
  return v;
}

export const useApi = (): Api => useAuth().api;
export const useRole = (): Role | null => useAuth().profile?.role ?? null;
export const useIsAdmin = (): boolean => useRole() === 'admin';
export const useCanReview = (): boolean => ['admin', 'rohbar'].includes(useRole() ?? '');
export const useIsStaff = (): boolean => ['admin', 'rohbar', 'viewer'].includes(useRole() ?? '');
