-- =====================================================================
-- Обновление 2: роли Рохбар и Коргар, отгулы с подтверждением, праздники,
-- исключённые сотрудники. Выполнить ОДИН раз после 001_init.sql:
-- Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- =====================================================================

-- ---------- Роли ------------------------------------------------------
-- admin  — всё; rohbar — руководитель: обзор, табель, проверка отгулов;
-- viewer — только просмотр табеля; korgar — сотрудник: только свои данные.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'rohbar', 'viewer', 'korgar'));

alter table public.profiles add column if not exists employee_id text
  references public.employees(employee_id) on delete set null;
create unique index if not exists profiles_employee_unique
  on public.profiles (employee_id) where employee_id is not null;

-- Видит данные всех сотрудников (не Коргар).
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin', 'rohbar', 'viewer'), false)
$$;

-- Проверяет отгулы.
create or replace function public.is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() in ('admin', 'rohbar'), false)
$$;

-- ID сотрудника FaceID, привязанный к текущему Коргару.
create or replace function public.my_employee_id()
returns text language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where user_id = auth.uid() and role = 'korgar'
$$;

-- ---------- Сотрудники: исключённые ------------------------------------
alter table public.employees add column if not exists excluded boolean not null default false;
alter table public.employees add column if not exists excluded_note text not null default '';

-- Коргар видит только себя.
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.my_employee_id()));

drop policy if exists days_read on public.attendance_days;
create policy days_read on public.attendance_days for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.my_employee_id()));

drop policy if exists uploads_read on public.uploads;
create policy uploads_read on public.uploads for select to authenticated using ((select public.is_staff()));

-- Настройки графика нужны всем, включая Коргара (чтобы посчитать его опоздания).
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using ((select public.is_member()));

create or replace function public.set_employee_excluded(p_employee_id text, p_excluded boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав: только администратор' using errcode = '42501';
  end if;
  update public.employees set excluded = p_excluded, excluded_note = left(coalesce(p_note, ''), 300)
   where employee_id = p_employee_id;
end;
$$;

-- Загрузка файла не должна сбрасывать отметку «исключён».
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

-- ---------- Праздники ---------------------------------------------------
create table if not exists public.holidays (
  day        date primary key,
  kind       text not null default 'holiday' check (kind in ('holiday', 'short')),
  end_minute integer check (end_minute between 0 and 1439),  -- для сокращённого дня
  name       text not null,
  comment    text not null default '',
  created_at timestamptz not null default now(),
  check (kind = 'holiday' or end_minute is not null)
);
alter table public.holidays enable row level security;

drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using ((select public.is_member()));
drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.holidays (day, kind, name, comment) values
  ('2026-09-09', 'holiday', 'Рӯзи Истиқлолият', 'День независимости Республики Таджикистан'),
  ('2026-11-06', 'holiday', 'Рӯзи Конститутсия', 'День Конституции Республики Таджикистан')
on conflict (day) do nothing;

-- ---------- Отгулы ------------------------------------------------------
-- Сотрудник отмечает сам и прикладывает подтверждение начальника.
-- Отгул засчитывается сразу (status = new); Рохбар/админ отмечает «Проверено» или «Отклонено».
create table if not exists public.absences (
  id            bigint generated always as identity primary key,
  employee_id   text not null references public.employees(employee_id) on delete cascade,
  day           date not null,
  from_minute   integer not null check (from_minute between 0 and 1439),
  to_minute     integer not null check (to_minute between 1 and 1440),
  reason        text not null check (length(reason) between 3 and 500),
  attachment_path text,
  status        text not null default 'new' check (status in ('new', 'checked', 'rejected')),
  review_note   text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at   timestamptz,
  check (to_minute > from_minute)
);
create index if not exists absences_day_idx on public.absences (day);
create index if not exists absences_emp_idx on public.absences (employee_id, day);
alter table public.absences enable row level security;

drop policy if exists absences_read on public.absences;
create policy absences_read on public.absences for select to authenticated
  using ((select public.is_staff()) or employee_id = (select public.my_employee_id()));
-- Запись — только через функции ниже.

create or replace function public.create_absence(
  p_day date, p_from integer, p_to integer, p_reason text, p_attachment text, p_employee_id text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_emp text;
  v_id bigint;
begin
  if public.is_admin() and p_employee_id is not null then
    v_emp := p_employee_id;          -- админ может внести отгул за сотрудника
  else
    v_emp := public.my_employee_id();
  end if;
  if v_emp is null then
    raise exception 'Недостаточно прав: отгул отмечает сам сотрудник' using errcode = '42501';
  end if;
  if p_day is null or p_day > current_date + 60 or p_day < current_date - 120 then
    raise exception 'Дата отгула вне допустимого диапазона';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Время окончания должно быть позже начала';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Укажите причину отгула';
  end if;
  if p_attachment is not null and split_part(p_attachment, '/', 1) <> v_emp then
    raise exception 'Файл подтверждения не принадлежит сотруднику';
  end if;
  insert into public.absences (employee_id, day, from_minute, to_minute, reason, attachment_path, created_by)
  values (v_emp, p_day, p_from, p_to, left(trim(p_reason), 500), p_attachment, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.review_absence(p_id bigint, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_reviewer() then
    raise exception 'Недостаточно прав: проверять отгулы может руководитель' using errcode = '42501';
  end if;
  if p_status not in ('checked', 'rejected', 'new') then
    raise exception 'Неизвестный статус';
  end if;
  if p_status = 'rejected' and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Укажите причину отклонения';
  end if;
  select full_name into v_name from public.profiles where user_id = auth.uid();
  update public.absences
     set status = p_status, review_note = left(coalesce(p_note, ''), 500),
         reviewed_by = auth.uid(), reviewed_by_name = coalesce(v_name, ''), reviewed_at = now()
   where id = p_id;
  if not found then raise exception 'Отгул не найден'; end if;
end;
$$;

-- Сотрудник может удалить свой отгул, пока его не проверили.
create or replace function public.delete_absence(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.absences
   where id = p_id
     and (public.is_admin() or (employee_id = public.my_employee_id() and status = 'new'));
  if not found then
    raise exception 'Удалить можно только свой непроверенный отгул' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_employee_excluded(text, boolean, text) from public, anon;
revoke all on function public.create_absence(date, integer, integer, text, text, text) from public, anon;
revoke all on function public.review_absence(bigint, text, text) from public, anon;
revoke all on function public.delete_absence(bigint) from public, anon;
grant execute on function public.set_employee_excluded(text, boolean, text) to authenticated;
grant execute on function public.create_absence(date, integer, integer, text, text, text) to authenticated;
grant execute on function public.review_absence(bigint, text, text) to authenticated;
grant execute on function public.delete_absence(bigint) to authenticated;

-- ---------- Файлы подтверждений (Supabase Storage) ----------------------
-- Приватное хранилище: файл лежит в папке <ID сотрудника>/..., до 5 МБ, фото или PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absence-files', 'absence-files', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists absence_files_read on storage.objects;
create policy absence_files_read on storage.objects for select to authenticated
  using (bucket_id = 'absence-files'
         and ((select public.is_staff()) or (storage.foldername(name))[1] = (select public.my_employee_id())));

drop policy if exists absence_files_insert on storage.objects;
create policy absence_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'absence-files'
              and ((select public.is_admin()) or (storage.foldername(name))[1] = (select public.my_employee_id())));
