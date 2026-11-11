/**
 * Проверка схемы базы и прав доступа в настоящем Postgres (PGlite, в памяти).
 * Supabase-окружение (схема auth, роли anon/authenticated, auth.uid()) имитируется.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const VIEWER = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';

const SUPABASE_SHIM = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  insert into auth.users values ('${ADMIN}'), ('${VIEWER}'), ('${STRANGER}');
`;

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const payload = (from: string, to: string, days: object[]) => ({
  fileName: 'test.xlsx',
  periodFrom: from,
  periodTo: to,
  rowsTotal: 10,
  issuesTotal: 0,
  employees: [{ employeeId: '313', name: 'Тестов Тест', department: 'Agency\\1Ҷ(ҶСК)' }],
  days,
});
const day = (date: string, firstIn: number, lastOut: number | null) => ({
  employeeId: '313',
  date,
  firstIn,
  lastOut,
  eventsCount: lastOut ? 2 : 1,
  nightIgnored: false,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const sql = readFileSync(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // повторный запуск не должен падать
  await db.exec(`insert into public.profiles (user_id, full_name, role) values
    ('${ADMIN}', 'Админ', 'admin'), ('${VIEWER}', 'Наблюдатель', 'viewer');`);
}, 60_000);

describe('схема Supabase', () => {
  it('настройки по умолчанию: уборщицы без графика (обратный слеш сохранён верно)', async () => {
    const r = await db.query<{ v: string[] }>(`select value->'noScheduleDepartments' as v from app_settings`);
    expect(r.rows[0].v).toEqual(['Agency\\Cleaner']);
  });

  it('admin загружает файл; данные за период заменяются атомарно', async () => {
    await as(ADMIN, () =>
      db.query('select import_attendance($1)', [
        payload('2026-10-01', '2026-10-31', [day('2026-10-01', 28800, 61200), day('2026-10-02', 30000, null)]),
      ]),
    );
    await as(ADMIN, () =>
      db.query('select import_attendance($1)', [
        payload('2026-10-01', '2026-10-31', [day('2026-10-01', 29000, 61000)]),
      ]),
    );
    const r = await as(VIEWER, () => db.query<{ n: number }>('select count(*)::int n from attendance_days'));
    expect(r.rows[0].n).toBe(1);
    const u = await as(VIEWER, () => db.query<{ n: number }>('select count(*)::int n from uploads'));
    expect(u.rows[0].n).toBe(2);
  });

  it('ошибка в данных откатывает всю загрузку — старые данные целы', async () => {
    const bad = payload('2026-10-01', '2026-10-31', [day('2026-10-05', 30000, 20000)]); // уход раньше прихода
    await expect(as(ADMIN, () => db.query('select import_attendance($1)', [bad]))).rejects.toThrow();
    const r = await as(ADMIN, () => db.query<{ d: string }>(`select day::text d from attendance_days`));
    expect(r.rows.map((x) => x.d)).toEqual(['2026-10-01']);
  });

  it('загрузка ноября не трогает октябрь', async () => {
    await as(ADMIN, () =>
      db.query('select import_attendance($1)', [
        payload('2026-11-01', '2026-11-11', [day('2026-11-02', 28800, 61200)]),
      ]),
    );
    const r = await as(VIEWER, () => db.query<{ month: string }>('select month from available_months()'));
    expect(r.rows.map((x) => x.month)).toEqual(['2026-11', '2026-10']);
  });

  it('viewer видит данные, но не может загрузить, изменить или удалить', async () => {
    await expect(
      as(VIEWER, () =>
        db.query('select import_attendance($1)', [payload('2026-10-01', '2026-10-31', [day('2026-10-01', 1, 2)])]),
      ),
    ).rejects.toThrow(/только администратор/);
    await expect(as(VIEWER, () => db.query(`select delete_month('2026-10-01')`))).rejects.toThrow(
      /только администратор/,
    );
    await as(VIEWER, () => db.query(`update app_settings set value = '{}'`));
    await as(VIEWER, () => db.query(`delete from attendance_days`));
    await as(VIEWER, () => db.query(`update profiles set role = 'admin'`));
    const s = await db.query<{ v: number }>(`select (value->>'shiftStartMinute')::int v from app_settings`);
    expect(s.rows[0].v).toBe(480);
    const n = await db.query<{ n: number }>('select count(*)::int n from attendance_days');
    expect(n.rows[0].n).toBe(2);
    const p = await db.query<{ role: string }>(`select role from profiles where user_id = '${VIEWER}'`);
    expect(p.rows[0].role).toBe('viewer');
  });

  it('зарегистрированный, но не добавленный пользователь не видит ничего', async () => {
    for (const t of ['employees', 'attendance_days', 'uploads', 'app_settings', 'profiles']) {
      const r = await as(STRANGER, () => db.query<{ n: number }>(`select count(*)::int n from ${t}`));
      expect(r.rows[0].n, t).toBe(0);
    }
    const m = await as(STRANGER, () => db.query('select * from available_months()'));
    expect(m.rows).toHaveLength(0);
  });

  it('аноним (без входа) видит только health', async () => {
    const h = await as(null, () => db.query<{ ok: boolean }>('select ok from health'));
    expect(h.rows[0].ok).toBe(true);
    const r = await as(null, () => db.query<{ n: number }>('select count(*)::int n from attendance_days'));
    expect(r.rows[0].n).toBe(0);
    await expect(
      as(null, () => db.query('select import_attendance($1)', [payload('2026-10-01', '2026-10-31', [])])),
    ).rejects.toThrow();
  });

  it('admin меняет настройки и удаляет месяц', async () => {
    await as(ADMIN, () => db.query(`update app_settings set value = jsonb_set(value, '{shiftStartMinute}', '540')`));
    const s = await db.query<{ v: number }>(`select (value->>'shiftStartMinute')::int v from app_settings`);
    expect(s.rows[0].v).toBe(540);
    const del = await as(ADMIN, () => db.query<{ n: number }>(`select delete_month('2026-11-15') n`));
    expect(del.rows[0].n).toBe(1);
  });

  it('viewer видит только свой профиль, admin — все', async () => {
    const v = await as(VIEWER, () => db.query('select * from profiles'));
    const a = await as(ADMIN, () => db.query('select * from profiles'));
    expect(v.rows).toHaveLength(1);
    expect(a.rows).toHaveLength(2);
  });
});
