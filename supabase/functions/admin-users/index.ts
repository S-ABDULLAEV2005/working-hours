// =====================================================================
// Управление пользователями платформы — Supabase Edge Function «admin-users».
// Установка: Supabase → Edge Functions → Deploy a new function → Via Editor,
// имя функции admin-users, вставить этот файл целиком, Deploy.
// Затем в настройках функции ВЫКЛЮЧИТЬ «Verify JWT» — проверка входа и роли
// делается ниже, в коде (так работает и со старыми, и с новыми ключами Supabase).
//
// Секретный ключ (service_role) берётся из окружения функции автоматически
// и никогда не попадает в браузер.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

type Role = 'admin' | 'viewer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const first = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
      if (typeof first === 'string') return first;
    } catch {
      return raw;
    }
  }
  throw new HttpError(500, 'Не найден секретный ключ Supabase в окружении функции.');
}

/** Пароль без похожих символов (0/O, 1/l/I) — его диктуют или переписывают. */
function generatePassword(length = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asRole = (v: unknown): Role => {
  if (v === 'admin' || v === 'viewer') return v;
  throw new HttpError(400, 'Роль должна быть admin или viewer.');
};
const asText = (v: unknown, field: string, max = 120): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new HttpError(400, `Не заполнено поле «${field}».`);
  if (s.length > max) throw new HttpError(400, `Поле «${field}» слишком длинное.`);
  return s;
};

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Метод не поддерживается.' });

  try {
    const url = Deno.env.get('SUPABASE_URL');
    if (!url) throw new HttpError(500, 'Не задан SUPABASE_URL.');
    const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. Кто вызывает? Проверяем токен входа пользователя.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Войдите заново.');
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) throw new HttpError(401, 'Сессия истекла. Войдите заново.');
    const me = who.user.id;

    // 2. Он администратор?
    const { data: myProfile } = await admin.from('profiles').select('role').eq('user_id', me).maybeSingle();
    if (myProfile?.role !== 'admin') throw new HttpError(403, 'Управлять пользователями может только администратор.');

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const countAdmins = async () => {
      const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin');
      return count ?? 0;
    };
    const targetId = (): string => {
      const id = asText(body.userId, 'Пользователь', 64);
      if (id === me) throw new HttpError(400, 'Это действие нельзя выполнить со своей учётной записью.');
      return id;
    };

    switch (action) {
      case 'list': {
        const users: { id: string; email: string; createdAt: string; lastSignInAt: string | null }[] = [];
        for (let page = 1; page < 50; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw new HttpError(500, error.message);
          users.push(
            ...data.users.map((u) => ({
              id: u.id,
              email: u.email ?? '',
              createdAt: u.created_at,
              lastSignInAt: u.last_sign_in_at ?? null,
            })),
          );
          if (data.users.length < 1000) break;
        }
        const { data: profiles, error } = await admin.from('profiles').select('user_id, full_name, role');
        if (error) throw new HttpError(500, error.message);
        const byId = new Map(profiles.map((p) => [p.user_id, p]));
        // Показываем только тех, у кого есть доступ к платформе.
        const list = users
          .filter((u) => byId.has(u.id))
          .map((u) => ({ ...u, fullName: byId.get(u.id)!.full_name, role: byId.get(u.id)!.role, isMe: u.id === me }));
        return json(200, { users: list });
      }

      case 'create': {
        const fullName = asText(body.fullName, 'ФИО');
        const email = asText(body.email, 'Email', 254).toLowerCase();
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Неверный формат email.');
        const role = asRole(body.role);
        const password = generatePassword();
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) {
            throw new HttpError(409, 'Пользователь с таким email уже существует.');
          }
          throw new HttpError(400, error.message);
        }
        const { error: pErr } = await admin.from('profiles').insert({ user_id: data.user.id, full_name: fullName, role });
        if (pErr) {
          await admin.auth.admin.deleteUser(data.user.id); // не оставляем «полусозданного» пользователя
          throw new HttpError(500, pErr.message);
        }
        return json(200, { userId: data.user.id, email, password });
      }

      case 'setRole': {
        const id = targetId();
        const role = asRole(body.role);
        const { data, error } = await admin.from('profiles').update({ role }).eq('user_id', id).select('user_id');
        if (error) throw new HttpError(500, error.message);
        if (!data?.length) throw new HttpError(404, 'Пользователь не найден.');
        return json(200, { ok: true });
      }

      case 'rename': {
        const id = asText(body.userId, 'Пользователь', 64);
        const fullName = asText(body.fullName, 'ФИО');
        const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('user_id', id);
        if (error) throw new HttpError(500, error.message);
        return json(200, { ok: true });
      }

      case 'resetPassword': {
        const id = targetId();
        const password = generatePassword();
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw new HttpError(400, error.message);
        return json(200, { password });
      }

      case 'delete': {
        const id = targetId();
        const { data: target } = await admin.from('profiles').select('role').eq('user_id', id).maybeSingle();
        if (target?.role === 'admin' && (await countAdmins()) <= 1) {
          throw new HttpError(400, 'Нельзя удалить последнего администратора.');
        }
        const { error } = await admin.auth.admin.deleteUser(id); // профиль удалится каскадом
        if (error) throw new HttpError(400, error.message);
        return json(200, { ok: true });
      }

      default:
        throw new HttpError(400, 'Неизвестное действие.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Внутренняя ошибка функции. Подробности — в логах Edge Functions.' });
  }
}

Deno.serve(handle);
