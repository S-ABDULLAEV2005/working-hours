-- =====================================================================
-- Выдача доступа пользователям. Выполнять в Supabase → SQL Editor.
-- Сначала создайте пользователя: Authentication → Users → Add user → Create new user
-- (email + пароль, включите «Auto Confirm User»). Затем выполните нужный блок ниже.
-- =====================================================================

-- Выдать роль АДМИНИСТРАТОРА (полный доступ):
insert into public.profiles (user_id, full_name, role)
select id, 'Имя Фамилия', 'admin' from auth.users where email = 'admin@example.com'
on conflict (user_id) do update set role = excluded.role, full_name = excluded.full_name;

-- Выдать роль НАБЛЮДАТЕЛЯ (только просмотр):
insert into public.profiles (user_id, full_name, role)
select id, 'Имя Фамилия', 'viewer' from auth.users where email = 'viewer@example.com'
on conflict (user_id) do update set role = excluded.role, full_name = excluded.full_name;

-- Посмотреть, у кого какой доступ:
select u.email, p.full_name, p.role, p.created_at
from public.profiles p join auth.users u on u.id = p.user_id
order by p.role, u.email;

-- Забрать доступ (пользователь сможет войти, но ничего не увидит):
-- delete from public.profiles where user_id = (select id from auth.users where email = 'someone@example.com');
