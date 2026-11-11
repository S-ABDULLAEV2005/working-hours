-- =====================================================================
-- Учёт рабочего времени — схема базы данных Supabase
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run.
-- Скрипт можно запускать повторно: он не удаляет данные.
-- =====================================================================

-- ---------- Пользователи и роли --------------------------------------
-- Строку сюда добавляет разработчик (см. README). Пользователь без строки
-- в profiles не видит НИЧЕГО, даже если сумел зарегистрироваться.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       text not null check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

-- Роль текущего пользователя. security definer — чтобы политики не зацикливались на profiles.
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_name() is not null
$$;

-- ---------- Данные ----------------------------------------------------
create table if not exists public.employees (
  employee_id text primary key,            -- «Ид. польз.» из FaceID
  name        text not null,
  department  text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.attendance_days (
  employee_id  text not null references public.employees(employee_id) on delete cascade,
  day          date not null,
  first_in     integer not null check (first_in between 0 and 86399),       -- секунды от полуночи
  last_out     integer check (last_out between 0 and 86399),               -- null = одна отметка
  events_count integer not null check (events_count >= 1),
  night_ignored boolean not null default false,
  upload_id    bigint,
  primary key (employee_id, day),
  check (last_out is null or last_out > first_in)
);
create index if not exists attendance_days_day_idx on public.attendance_days (day);

create table if not exists public.uploads (
  id            bigint generated always as identity primary key,
  file_name     text not null,
  period_from   date not null,
  period_to     date not null,
  rows_total    integer not null,
  days_total    integer not null,
  employees_total integer not null,
  issues_total  integer not null default 0,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null default '',
  created_at    timestamptz not null default now()
);

-- Одна строка с настройками графика.
create table if not exists public.app_settings (
  id         integer primary key default 1 check (id = 1),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.app_settings (id, value) values (1, '{
  "shiftStartMinute": 480,
  "shiftEndMinute": 1020,
  "noScheduleDepartments": ["Agency\\Cleaner"],
  "workdays": [1,2,3,4,5],
  "holidays": ["2026-09-09","2026-11-06"],
  "lunch": null
}'::jsonb) on conflict (id) do nothing;

-- Таблица для «пинга», чтобы бесплатный проект Supabase не засыпал. Данных сотрудников не содержит.
create table if not exists public.health (
  id integer primary key default 1 check (id = 1),
  ok boolean not null default true
);
insert into public.health (id) values (1) on conflict (id) do nothing;

-- ---------- Row Level Security ----------------------------------------
alter table public.profiles        enable row level security;
alter table public.employees       enable row level security;
alter table public.attendance_days enable row level security;
alter table public.uploads         enable row level security;
alter table public.app_settings    enable row level security;
alter table public.health          enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or (select public.is_admin()));

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated using ((select public.is_member()));

drop policy if exists days_read on public.attendance_days;
create policy days_read on public.attendance_days for select to authenticated using ((select public.is_member()));

drop policy if exists uploads_read on public.uploads;
create policy uploads_read on public.uploads for select to authenticated using ((select public.is_member()));

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using ((select public.is_member()));

drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists health_read on public.health;
create policy health_read on public.health for select to anon, authenticated using (true);

-- Прямой записи в данные нет ни у кого: загрузка и удаление идут только через функции ниже,
-- которые сами проверяют роль admin и выполняются одной транзакцией.

-- ---------- Загрузка файла (атомарно) ----------------------------------
-- payload: { fileName, periodFrom, periodTo, rowsTotal, issuesTotal,
--            employees: [{employeeId,name,department}],
--            days: [{employeeId,date,firstIn,lastOut,eventsCount,nightIgnored}] }
-- Данные за даты периода файла ЗАМЕНЯЮТСЯ полностью. Если что-то пошло не так —
-- откатывается всё, старые данные остаются нетронутыми.
create or replace function public.import_attendance(payload jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_upload_id bigint;
  v_from date := (payload->>'periodFrom')::date;
  v_to   date := (payload->>'periodTo')::date;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав: загружать файлы может только администратор' using errcode = '42501';
  end if;
  if v_from is null or v_to is null or v_from > v_to then
    raise exception 'Некорректный период файла';
  end if;
  if jsonb_array_length(coalesce(payload->'days', '[]'::jsonb)) = 0 then
    raise exception 'В файле нет данных для загрузки';
  end if;

  select full_name into v_name from public.profiles where user_id = auth.uid();

  insert into public.uploads (file_name, period_from, period_to, rows_total, days_total, employees_total,
                              issues_total, uploaded_by, uploaded_by_name)
  values (left(coalesce(payload->>'fileName', 'без имени'), 255), v_from, v_to,
          coalesce((payload->>'rowsTotal')::int, 0),
          jsonb_array_length(payload->'days'),
          jsonb_array_length(coalesce(payload->'employees', '[]'::jsonb)),
          coalesce((payload->>'issuesTotal')::int, 0),
          auth.uid(), coalesce(v_name, ''))
  returning id into v_upload_id;

  insert into public.employees (employee_id, name, department, updated_at)
  select e->>'employeeId', e->>'name', coalesce(e->>'department', ''), now()
  from jsonb_array_elements(coalesce(payload->'employees', '[]'::jsonb)) e
  on conflict (employee_id) do update
    set name = excluded.name, department = excluded.department, updated_at = now();

  delete from public.attendance_days where day between v_from and v_to;

  insert into public.attendance_days (employee_id, day, first_in, last_out, events_count, night_ignored, upload_id)
  select d->>'employeeId', (d->>'date')::date, (d->>'firstIn')::int,
         nullif(d->>'lastOut', '')::int, (d->>'eventsCount')::int,
         coalesce((d->>'nightIgnored')::boolean, false), v_upload_id
  from jsonb_array_elements(payload->'days') d;

  return v_upload_id;
end;
$$;

-- Удаление данных за месяц (например, загрузили не тот файл).
create or replace function public.delete_month(p_month date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав: удалять данные может только администратор' using errcode = '42501';
  end if;
  delete from public.attendance_days
   where day >= date_trunc('month', p_month)::date
     and day <  (date_trunc('month', p_month) + interval '1 month')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Список месяцев, по которым есть данные (для выпадающего списка).
create or replace function public.available_months()
returns table(month text, days bigint) language sql stable security definer set search_path = public as $$
  select to_char(day, 'YYYY-MM') as month, count(*) as days
  from public.attendance_days
  where public.is_member()
  group by 1 order by 1 desc
$$;

revoke all on function public.import_attendance(jsonb) from public, anon;
revoke all on function public.delete_month(date) from public, anon;
revoke all on function public.available_months() from public, anon;
grant execute on function public.import_attendance(jsonb) to authenticated;
grant execute on function public.delete_month(date) to authenticated;
grant execute on function public.available_months() to authenticated;
