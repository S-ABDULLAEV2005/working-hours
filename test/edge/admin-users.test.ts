/**
 * Тест серверной функции admin-users: настоящий код функции, подменены только Deno и supabase-js.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addUser, reset, store } from './fakeSupabase';

let handle: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'secret' };
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] }, serve: () => {} };
  ({ handle } = await import('../../supabase/functions/admin-users/index.ts'));
});

beforeEach(() => reset());

const call = async (token: string | null, body: object) => {
  const res = await handle(
    new Request('https://x/functions/v1/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
};

describe('admin-users', () => {
  it('без входа — 401, viewer — 403, человек без роли — 403', async () => {
    addUser('v@x.tj', 'viewer', 'tv');
    addUser('n@x.tj', null, 'tn');
    expect((await call(null, { action: 'list' })).status).toBe(401);
    expect((await call('bad', { action: 'list' })).status).toBe(401);
    expect((await call('tv', { action: 'list' })).status).toBe(403);
    expect((await call('tn', { action: 'list' })).status).toBe(403);
    expect((await call('tv', { action: 'create', email: 'h@x.tj', fullName: 'H', role: 'admin' })).status).toBe(403);
  });

  it('CORS: preflight проходит (сайт на другом домене)', async () => {
    const res = await handle(new Request('https://x/', { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('админ создаёт смотрителя: пароль сгенерирован, email подтверждён, роль выдана', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    const r = await call('ta', {
      action: 'create',
      email: ' New@Mail.TJ ',
      fullName: 'Новый Сотрудник',
      role: 'viewer',
    });
    expect(r.status).toBe(200);
    expect(r.body.email).toBe('new@mail.tj');
    expect(r.body.password).toMatch(/^[a-zA-Z2-9]{12}$/);
    expect(r.body.password).not.toMatch(/[01OIl]/);
    expect(store.profiles.find((p) => p.user_id === r.body.userId)).toMatchObject({
      role: 'viewer',
      full_name: 'Новый Сотрудник',
    });
  });

  it('проверка ввода: email, ФИО, роль, дубликат', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    expect((await call('ta', { action: 'create', email: 'плохой', fullName: 'X', role: 'viewer' })).body.error).toMatch(
      /email/,
    );
    expect(
      (await call('ta', { action: 'create', email: 'b@x.tj', fullName: '  ', role: 'viewer' })).body.error,
    ).toMatch(/ФИО/);
    expect((await call('ta', { action: 'create', email: 'b@x.tj', fullName: 'B', role: 'root' })).status).toBe(400);
    expect((await call('ta', { action: 'create', email: 'a@x.tj', fullName: 'A', role: 'viewer' })).status).toBe(409);
  });

  it('если роль не записалась — пользователь не остаётся «полусозданным»', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    store.failProfileInsert = true;
    const r = await call('ta', { action: 'create', email: 'c@x.tj', fullName: 'C', role: 'viewer' });
    expect(r.status).toBe(500);
    expect(store.users.some((u) => u.email === 'c@x.tj')).toBe(false);
  });

  it('список: только пользователи с доступом, отмечен «я»', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    addUser('v@x.tj', 'viewer');
    addUser('stranger@x.tj', null);
    const r = await call('ta', { action: 'list' });
    expect(r.body.users.map((u: { email: string }) => u.email).sort()).toEqual(['a@x.tj', 'v@x.tj']);
    expect(r.body.users.find((u: { isMe: boolean }) => u.isMe).email).toBe('a@x.tj');
  });

  it('смена роли, сброс пароля, удаление', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    const v = addUser('v@x.tj', 'viewer');
    expect((await call('ta', { action: 'setRole', userId: v, role: 'admin' })).status).toBe(200);
    expect(store.profiles.find((p) => p.user_id === v)!.role).toBe('admin');
    const old = store.users.find((u) => u.id === v)!.password;
    const pw = await call('ta', { action: 'resetPassword', userId: v });
    expect(pw.body.password).not.toBe(old);
    expect(store.users.find((u) => u.id === v)!.password).toBe(pw.body.password);
    expect((await call('ta', { action: 'delete', userId: v })).status).toBe(200);
    expect(store.users.some((u) => u.id === v)).toBe(false);
    expect(store.profiles.some((p) => p.user_id === v)).toBe(false);
  });

  it('нельзя удалить или понизить самого себя — платформа не останется без админа', async () => {
    const a = addUser('a@x.tj', 'admin', 'ta');
    expect((await call('ta', { action: 'delete', userId: a })).status).toBe(400);
    expect((await call('ta', { action: 'setRole', userId: a, role: 'viewer' })).status).toBe(400);
    expect((await call('ta', { action: 'resetPassword', userId: a })).status).toBe(400);
    expect(store.profiles.find((p) => p.user_id === a)!.role).toBe('admin');
  });

  it('неизвестное действие — 400', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    expect((await call('ta', { action: 'hack' })).status).toBe(400);
  });

  it('создание Коргара: логин = ID, email на служебном домене, ФИО из табеля', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    store.employees.push({ employee_id: '313', name: 'Сотрудник А' });
    const r = await call('ta', { action: 'create', role: 'korgar', employeeId: '313' });
    expect(r.status).toBe(200);
    expect(r.body.login).toBe('313');
    expect(store.users.find((u) => u.id === r.body.userId)!.email).toBe('313@staff.davomot.tj');
    expect(store.profiles.find((p) => p.user_id === r.body.userId)).toMatchObject({
      role: 'korgar',
      employee_id: '313',
      full_name: 'Сотрудник А',
    });
    const again = await call('ta', { action: 'create', role: 'korgar', employeeId: '313' });
    expect(again.status).toBe(409);
    expect((await call('ta', { action: 'create', role: 'korgar', employeeId: '999' })).status).toBe(404);
  });

  it('массовое создание: созданные + ошибки по каждому, пароли разные', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    store.employees.push(
      { employee_id: '1', name: 'А' },
      { employee_id: '2', name: 'Б' },
      { employee_id: '3', name: 'В' },
    );
    await call('ta', { action: 'create', role: 'korgar', employeeId: '3' });
    const r = await call('ta', { action: 'createKorgarBulk', employeeIds: ['1', '2', '3', '404'] });
    expect(r.body.created.map((c: { login: string }) => c.login)).toEqual(['1', '2']);
    expect(new Set(r.body.created.map((c: { password: string }) => c.password)).size).toBe(2);
    expect(r.body.failed.map((f: { employeeId: string }) => f.employeeId)).toEqual(['3', '404']);
  });

  it('роль Коргара не меняется и никого нельзя сделать Коргаром через смену роли', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    store.employees.push({ employee_id: '313', name: 'А' });
    const k = (await call('ta', { action: 'create', role: 'korgar', employeeId: '313' })).body.userId;
    const v = addUser('v@x.tj', 'viewer');
    expect((await call('ta', { action: 'setRole', userId: k, role: 'admin' })).status).toBe(400);
    expect((await call('ta', { action: 'setRole', userId: v, role: 'korgar' })).status).toBe(400);
    expect((await call('ta', { action: 'setRole', userId: v, role: 'rohbar' })).status).toBe(200);
  });

  it('Рохбар не может управлять пользователями', async () => {
    addUser('r@x.tj', 'rohbar' as 'admin', 'tr');
    expect((await call('tr', { action: 'list' })).status).toBe(403);
  });

  it('email на служебном домене нельзя занять вручную', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    expect(
      (await call('ta', { action: 'create', role: 'viewer', fullName: 'X', email: '313@staff.davomot.tj' })).status,
    ).toBe(400);
  });

  it('массовая выдача новых паролей — только Коргарам', async () => {
    addUser('a@x.tj', 'admin', 'ta');
    store.employees.push({ employee_id: '1', name: 'А' }, { employee_id: '2', name: 'Б' });
    const bulk = await call('ta', { action: 'createKorgarBulk', employeeIds: ['1', '2'] });
    const ids = store.profiles.filter((p) => p.role === 'korgar').map((p) => p.user_id);
    const old = store.users.filter((u) => ids.includes(u.id)).map((u) => u.password);
    const v = addUser('v@x.tj', 'viewer');
    const r = await call('ta', { action: 'resetPasswordsBulk', userIds: [...ids, v] });
    expect(r.body.created.map((c: { login: string }) => c.login).sort()).toEqual(['1', '2']);
    expect(r.body.failed).toHaveLength(1);
    const now = store.users.filter((u) => ids.includes(u.id)).map((u) => u.password);
    expect(now).not.toEqual(old);
    expect(bulk.body.created).toHaveLength(2);
  });
});
