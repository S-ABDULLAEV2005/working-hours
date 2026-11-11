import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Api, Profile } from './api';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'no-access' | 'error';
  profile: Profile | null;
  error: string | null;
  api: Api;
  refresh: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ api, children }: { api: Api; children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<Omit<AuthState, 'api' | 'refresh'>>({
    status: 'loading',
    profile: null,
    error: null,
  });

  const refresh = useCallback(() => {
    api
      .currentProfile()
      .then((p) => setState({ status: p ? 'signed-in' : 'signed-out', profile: p, error: null }))
      .catch((e: Error) =>
        setState({
          status: e.name === 'NoAccessError' || /доступ к платформе не выдан/.test(e.message) ? 'no-access' : 'error',
          profile: null,
          error: e.message,
        }),
      );
  }, [api]);

  useEffect(() => {
    refresh();
    return api.onAuthChange(() => {
      qc.clear(); // данные другого пользователя не должны остаться в кэше
      refresh();
    });
  }, [api, qc, refresh]);

  return <Ctx.Provider value={{ ...state, api, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth вне AuthProvider');
  return v;
}

export function useApi(): Api {
  return useAuth().api;
}

export function useIsAdmin(): boolean {
  return useAuth().profile?.role === 'admin';
}
