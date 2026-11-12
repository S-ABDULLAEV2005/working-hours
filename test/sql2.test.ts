/**
 * Обновление 2: роли Рохбар/Коргар, отгулы, праздники, исключённые, файлы.
 * Настоящий Postgres (PGlite) + имитация окружения Supabase (auth, storage).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  rohbar: '22222222-2222-2222-2222-222222222222',
  viewer: '33333333-3333-3333-3333-333333333333',
  k313: '44444444-4444-4444-4444-444444444444',
  k299: '55555555-5555-5555-5555-555555555555',
  stranger: '66666666-6666-6666-6666-666666666666',
};

const SHIM = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant usage on sequence storage.objects_id_seq to authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  insert into auth.users values ${Object.values(U)
    .map((u) => `('${u}')`)
    .join(',')};
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
const count = async (user: string, sql: string) =>
  (await as(user, () => db.query<{ n: number }>(`select count(*)::int n from (${sql}) x`))).rows[0].n;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  await db.exec(readFileSync(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8'));
  const m2 = readFileSync(new URL('../supabase/migrations/002_roles_absences.sql', import.meta.url), 'utf8');
  await db.exec(m2);
  await db.exec(m2); // повторный запуск безопасен
  await db.exec(`
    insert into employees (employee_id, name, department) values ('313', 'Сотрудник А', 'Agency\\Main'), ('299', 'Сотрудник Б', 'Agency\\Main'), ('500', 'Сотрудник В', 'Agency\\Main');
    insert into attendance_days (employee_id, day, first_in, last_out, events_count) values
      ('313', '2026-10-07', 40680, 66240, 4), ('299', '2026-10-07', 63664, null, 1), ('500', '2026-10-07', 28800, 61200, 2);
    insert into profiles (user_id, full_name, role, employee_id) values
      ('${U.admin}', 'Админ', 'admin', null), ('${U.rohbar}', 'Рохбар', 'rohbar', null), ('${U.viewer}', 'Наблюдатель', 'viewer', null),
      ('${U.k313}', 'Сотрудник А', 'korgar', '313'), ('${U.k299}', 'Сотрудник Б', 'korgar', '299');
  `);
}, 60_000);

describe('роль Коргар видит только себя', () => {
  it('свои дни и свою карточку — да, чужие — нет', async () => {
    expect(await count(U.k313, 'select * from attendance_days')).toBe(1);
    expect(await count(U.k313, `select * from attendance_days where employee_id = '299'`)).toBe(0);
    expect(await count(U.k313, 'select * from employees')).toBe(1);
    expect(await count(U.k313, 'select * from uploads')).toBe(0);
  });
  it('настройки и праздники Коргару доступны (нужны для расчёта)', async () => {
    expect(await count(U.k313, 'select * from app_settings')).toBe(1);
    expect(await count(U.k313, 'select * from holidays')).toBe(2);
  });
  it('Рохбар и наблюдатель видят всех', async () => {
    expect(await count(U.rohbar, 'select * from attendance_days')).toBe(3);
    expect(await count(U.viewer, 'select * from employees')).toBe(3);
  });
  it('посторонний без роли не видит ничего', async () => {
    for (const t of ['attendance_days', 'employees', 'absences', 'holidays', 'app_settings'])
      expect(await count(U.stranger, `select * from ${t}`), t).toBe(0);
  });
});

describe('отгулы', () => {
  it('Коргар создаёт отгул только на себя; файл — только из своей папки', async () => {
    await as(U.k313, () => db.query(`select create_absence($1, 480, 720, 'Налоговая', '313/a.jpg', '299')`, [today]));
    const r = await db.query<{ employee_id: string; status: string }>('select employee_id, status from absences');
    expect(r.rows).toEqual([{ employee_id: '313', status: 'new' }]); // p_employee_id игнорируется для Коргара
    await expect(
      as(U.k313, () => db.query(`select create_absence($1, 480, 720, 'Налоговая', '299/x.jpg')`, [today])),
    ).rejects.toThrow(/не принадлежит/);
  });
  it('проверка ввода: время, причина, дата', async () => {
    await expect(
      as(U.k313, () => db.query(`select create_absence($1, 720, 480, 'Налоговая', null)`, [today])),
    ).rejects.toThrow(/позже начала/);
    await expect(as(U.k313, () => db.query(`select create_absence($1, 480, 720, ' ', null)`, [today]))).rejects.toThrow(
      /причину/,
    );
    await expect(
      as(U.k313, () => db.query(`select create_absence('2020-01-01', 480, 720, 'Налоговая', null)`)),
    ).rejects.toThrow(/диапазона/);
  });
  it('наблюдатель и рохбар не могут создать отгул «за себя» (они не сотрудники)', async () => {
    await expect(
      as(U.viewer, () => db.query(`select create_absence($1, 480, 720, 'Тест', null)`, [today])),
    ).rejects.toThrow(/Недостаточно прав/);
    await expect(
      as(U.rohbar, () => db.query(`select create_absence($1, 480, 720, 'Тест', null)`, [today])),
    ).rejects.toThrow(/Недостаточно прав/);
  });
  it('админ может внести отгул за сотрудника', async () => {
    await as(U.admin, () => db.query(`select create_absence($1, 480, 600, 'Командировка', null, '500')`, [today]));
    expect(await count(U.admin, `select * from absences where employee_id = '500'`)).toBe(1);
  });
  it('Коргар видит только свои отгулы, Рохбар — все', async () => {
    expect(await count(U.k299, 'select * from absences')).toBe(0);
    expect(await count(U.k313, 'select * from absences')).toBe(1);
    expect(await count(U.rohbar, 'select * from absences')).toBe(2);
  });
  it('проверка: Рохбар отклоняет с причиной; Коргар и наблюдатель не могут', async () => {
    const id = (await db.query<{ id: number }>(`select id from absences where employee_id = '313'`)).rows[0].id;
    await expect(as(U.k313, () => db.query(`select review_absence($1, 'checked')`, [id]))).rejects.toThrow(
      /руководитель/,
    );
    await expect(as(U.viewer, () => db.query(`select review_absence($1, 'checked')`, [id]))).rejects.toThrow(
      /руководитель/,
    );
    await expect(as(U.rohbar, () => db.query(`select review_absence($1, 'rejected', '')`, [id]))).rejects.toThrow(
      /причину/,
    );
    await as(U.rohbar, () => db.query(`select review_absence($1, 'rejected', 'Нет подписи')`, [id]));
    const r = await db.query<{ status: string; review_note: string; reviewed_by_name: string }>(
      `select status, review_note, reviewed_by_name from absences where id = ${id}`,
    );
    expect(r.rows[0]).toEqual({ status: 'rejected', review_note: 'Нет подписи', reviewed_by_name: 'Рохбар' });
  });
  it('Коргар не может удалить проверенный/отклонённый отгул, но может свой новый', async () => {
    const rejected = (await db.query<{ id: number }>(`select id from absences where employee_id = '313'`)).rows[0].id;
    await expect(as(U.k313, () => db.query(`select delete_absence($1)`, [rejected]))).rejects.toThrow(/непроверенный/);
    await as(U.k313, () => db.query(`select create_absence($1, 900, 960, 'Врач', null)`, [today]));
    const fresh = (
      await db.query<{ id: number }>(`select id from absences where employee_id = '313' and status = 'new'`)
    ).rows[0].id;
    await as(U.k313, () => db.query(`select delete_absence($1)`, [fresh]));
    expect(await count(U.admin, `select * from absences where employee_id = '313'`)).toBe(1);
  });
  it('прямая запись в таблицу отгулов запрещена (только через функции)', async () => {
    await as(U.k313, () => db.query(`update absences set status = 'checked'`).catch(() => null));
    const r = await db.query<{ status: string }>(`select status from absences where employee_id = '313'`);
    expect(r.rows[0].status).toBe('rejected');
  });
});

describe('файлы подтверждений', () => {
  it('Коргар загружает только в свою папку и видит только свои файлы', async () => {
    await as(U.k313, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('absence-files', '313/a.jpg')`),
    );
    await expect(
      as(U.k313, () => db.query(`insert into storage.objects (bucket_id, name) values ('absence-files', '299/b.jpg')`)),
    ).rejects.toThrow();
    await as(U.k299, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('absence-files', '299/b.jpg')`),
    );
    expect(await count(U.k313, 'select * from storage.objects')).toBe(1);
    expect(await count(U.rohbar, 'select * from storage.objects')).toBe(2);
    expect(await count(U.stranger, 'select * from storage.objects')).toBe(0);
  });
  it('хранилище приватное, лимит 5 МБ', async () => {
    const b = await db.query<{ public: boolean; file_size_limit: number }>(
      `select public, file_size_limit from storage.buckets where id = 'absence-files'`,
    );
    expect(b.rows[0]).toEqual({ public: false, file_size_limit: 5242880 });
  });
});

describe('праздники и исключённые', () => {
  it('праздники меняет только админ', async () => {
    await as(U.rohbar, () => db.query(`insert into holidays (day, name) values ('2026-12-31', 'X')`).catch(() => null));
    expect(await count(U.admin, `select * from holidays where day = '2026-12-31'`)).toBe(0);
    await as(U.admin, () =>
      db.query(
        `insert into holidays (day, kind, end_minute, name, comment) values ('2026-12-31', 'short', 960, 'Канун Нового года', 'до 16:00')`,
      ),
    );
    expect(await count(U.k313, 'select * from holidays')).toBe(3);
    await expect(
      as(U.admin, () =>
        db.query(`insert into holidays (day, kind, name) values ('2026-12-30', 'short', 'без времени')`),
      ),
    ).rejects.toThrow();
  });
  it('исключение сотрудника — только админ; повторная загрузка файла его не сбрасывает', async () => {
    await expect(as(U.rohbar, () => db.query(`select set_employee_excluded('299', true, 'гость')`))).rejects.toThrow(
      /администратор/,
    );
    await as(U.admin, () => db.query(`select set_employee_excluded('299', true, 'гость')`));
    await as(U.admin, () =>
      db.query('select import_attendance($1)', [
        {
          fileName: 'f.xlsx',
          periodFrom: '2026-10-08',
          periodTo: '2026-10-08',
          rowsTotal: 1,
          employees: [{ employeeId: '299', name: 'Сотрудник Б', department: 'Agency\\Main' }],
          days: [{ employeeId: '299', date: '2026-10-08', firstIn: 30000, lastOut: 60000, eventsCount: 2 }],
        },
      ]),
    );
    const r = await db.query<{ excluded: boolean; excluded_note: string }>(
      `select excluded, excluded_note from employees where employee_id = '299'`,
    );
    expect(r.rows[0]).toEqual({ excluded: true, excluded_note: 'гость' });
  });
});

describe('роли', () => {
  it('неизвестная роль не принимается', async () => {
    await expect(
      db.exec(`insert into profiles (user_id, full_name, role) values ('${U.stranger}', 'X', 'superadmin')`),
    ).rejects.toThrow();
  });
  it('один сотрудник FaceID — один аккаунт Коргара', async () => {
    await expect(
      db.exec(
        `insert into profiles (user_id, full_name, role, employee_id) values ('${U.stranger}', 'X', 'korgar', '313')`,
      ),
    ).rejects.toThrow();
  });
});
