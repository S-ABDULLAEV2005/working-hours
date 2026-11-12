-- =====================================================================
-- Обновление 3: отгулы проверяет ТОЛЬКО Рохбар.
-- Администратор видит отгулы, но не может проверять, отклонять, удалять
-- или вносить их за сотрудника. Выполнить после 002. Повторный запуск безопасен.
-- =====================================================================

create or replace function public.is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'rohbar', false)
$$;

-- Отгул отмечает только сам сотрудник (Коргар).
create or replace function public.create_absence(
  p_day date, p_from integer, p_to integer, p_reason text, p_attachment text, p_employee_id text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_emp text := public.my_employee_id();
  v_id bigint;
begin
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

-- Удалить можно только свой непроверенный отгул.
create or replace function public.delete_absence(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.absences
   where id = p_id and employee_id = public.my_employee_id() and status = 'new';
  if not found then
    raise exception 'Удалить можно только свой непроверенный отгул' using errcode = '42501';
  end if;
end;
$$;

-- Файлы подтверждений загружает только сам сотрудник в свою папку.
drop policy if exists absence_files_insert on storage.objects;
create policy absence_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'absence-files' and (storage.foldername(name))[1] = (select public.my_employee_id()));
