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

type Role = 'admin' | 'rohbar' | 'viewer' | 'korgar';
const STAFF_ROLES: Role[] = ['admin', 'rohbar', 'viewer'];

/**
 * Сотрудники (Коргар) входят по ID из FaceID. Внутри Supabase им нужен email,
 * поэтому он строится как <ID>@<домен>. Писем на этот адрес не отправляется.
 * Если меняете домен — поменяйте и VITE_KORGAR_LOGIN_DOMAIN на сайте.
 */
const KORGAR_DOMAIN = Deno.env.get('KORGAR_LOGIN_DOMAIN') ?? 'staff.davomot.tj';
const korgarEmail = (employeeId: string) => `${employeeId.toLowerCase()}@${KORGAR_DOMAIN}`;

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
  if (v === 'admin' || v === 'rohbar' || v === 'viewer' || v === 'korgar') return v;
  throw new HttpError(400, 'Неизвестная роль.');
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

    /** Аккаунт сотрудника по ID из FaceID: логин = ID, пароль генерируется. */
    const createKorgar = async (employeeId: string) => {
      const { data: emp } = await admin.from('employees').select('employee_id, name').eq('employee_id', employeeId).maybeSingle();
      if (!emp) throw new HttpError(404, `Сотрудник с ID ${employeeId} не найден в загруженных данных.`);
      const { data: linked } = await admin.from('profiles').select('user_id').eq('employee_id', employeeId).maybeSingle();
      if (linked) throw new HttpError(409, `У сотрудника ID ${employeeId} уже есть аккаунт.`);
      const password = generatePassword();
      const { data, error } = await admin.auth.admin.createUser({ email: korgarEmail(employeeId), password, email_confirm: true });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) throw new HttpError(409, `У сотрудника ID ${employeeId} уже есть аккаунт.`);
        throw new HttpError(400, error.message);
      }
      const { error: pErr } = await admin
        .from('profiles')
        .insert({ user_id: data.user.id, full_name: emp.name, role: 'korgar', employee_id: employeeId });
      if (pErr) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw new HttpError(500, pErr.message);
      }
      return { userId: data.user.id, name: emp.name as string, login: employeeId, password };
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
        const { data: profiles, error } = await admin.from('profiles').select('user_id, full_name, role, employee_id');
        if (error) throw new HttpError(500, error.message);
        const byId = new Map(profiles.map((p) => [p.user_id, p]));
        // Показываем только тех, у кого есть доступ к платформе.
        const list = users
          .filter((u) => byId.has(u.id))
          .map((u) => {
            const p = byId.get(u.id)!;
            return {
              ...u,
              fullName: p.full_name,
              role: p.role,
              employeeId: p.employee_id ?? null,
              login: p.role === 'korgar' && p.employee_id ? p.employee_id : u.email,
              isMe: u.id === me,
            };
          });
        return json(200, { users: list });
      }

      case 'create': {
        const role = asRole(body.role);
        if (role === 'korgar') {
          const res = await createKorgar(asText(body.employeeId, 'Сотрудник', 64));
          return json(200, { userId: res.userId, email: res.login, login: res.login, password: res.password });
        }
        const fullName = asText(body.fullName, 'ФИО');
        const email = asText(body.email, 'Email', 254).toLowerCase();
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Неверный формат email.');
        if (email.endsWith(`@${KORGAR_DOMAIN}`)) throw new HttpError(400, 'Этот домен зарезервирован для входа сотрудников по ID.');
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
        return json(200, { userId: data.user.id, email, login: email, password });
      }

      case 'createKorgarBulk': {
        const ids: unknown = body.employeeIds;
        if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Не выбраны сотрудники.');
        if (ids.length > 500) throw new HttpError(400, 'За один раз можно создать не больше 500 аккаунтов.');
        const created: { employeeId: string; name: string; login: string; password: string }[] = [];
        const failed: { employeeId: string; error: string }[] = [];
        for (const raw of ids) {
          const id = typeof raw === 'string' ? raw.trim() : '';
          if (!id) continue;
          try {
            const r = await createKorgar(id);
            created.push({ employeeId: id, name: r.name, login: r.login, password: r.password });
          } catch (e) {
            failed.push({ employeeId: id, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return json(200, { created, failed });
      }

      case 'setRole': {
        const id = targetId();
        const role = asRole(body.role);
        const { data: cur } = await admin.from('profiles').select('role').eq('user_id', id).maybeSingle();
        if (cur?.role === 'korgar' || role === 'korgar') {
          throw new HttpError(400, 'Роль сотрудника (Коргар) не меняется: создайте отдельный аккаунт.');
        }
        if (!STAFF_ROLES.includes(role)) throw new HttpError(400, 'Неизвестная роль.');
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

      case 'resetPasswordsBulk': {
        // Новые пароли сразу многим сотрудникам (Коргар). Только Коргар — массово менять пароли админам нельзя.
        const ids: unknown = body.userIds;
        if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Не выбраны пользователи.');
        if (ids.length > 100) throw new HttpError(400, 'За один раз — не больше 100 пользователей.');
        const created: { employeeId: string; name: string; login: string; password: string }[] = [];
        const failed: { employeeId: string; error: string }[] = [];
        for (const raw of ids) {
          const id = typeof raw === 'string' ? raw : '';
          const { data: p } = await admin.from('profiles').select('role, full_name, employee_id').eq('user_id', id).maybeSingle();
          const label = (p?.employee_id as string) ?? id;
          if (!p || p.role !== 'korgar' || !p.employee_id) {
            failed.push({ employeeId: label, error: 'Не сотрудник (Коргар).' });
            continue;
          }
          const password = generatePassword();
          const { error } = await admin.auth.admin.updateUserById(id, { password });
          if (error) failed.push({ employeeId: label, error: error.message });
          else created.push({ employeeId: p.employee_id, name: p.full_name, login: p.employee_id, password });
        }
        return json(200, { created, failed });
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
