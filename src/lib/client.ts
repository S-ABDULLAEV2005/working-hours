import type { Api } from './api';
import { DemoApi } from './demoApi';
import { SupabaseApi } from './supabaseApi';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const demo = import.meta.env.VITE_DEMO === '1';

/** null — сайт собран без настроек Supabase: показываем понятную страницу вместо белого экрана. */
export const api: Api | null = demo ? new DemoApi() : url && key ? new SupabaseApi(url, key) : null;
