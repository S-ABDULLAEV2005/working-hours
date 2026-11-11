import type { Api } from './api';
import { DemoApi } from './demoApi';
import { SupabaseApi } from './supabaseApi';

/**
 * Нормализует адрес проекта: частая ошибка — вставить https://xxx.supabase.co/rest/v1/
 * или адрес с лишним слешем. Сайту нужен только корень https://xxx.supabase.co
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().replace(/^["']|["']$/g, '');
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
  }
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, '');
const demo = import.meta.env.VITE_DEMO === '1';

/** null — сайт собран без настроек Supabase: показываем понятную страницу вместо белого экрана. */
export const api: Api | null = demo ? new DemoApi() : url && key ? new SupabaseApi(url, key) : null;
