-- Dienstplan Landsknecht v4.0 SQL Update
-- In Supabase → SQL Editor ausführen

alter table profiles add column if not exists department text;
alter table profiles add column if not exists plannable boolean not null default true;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists active boolean not null default true;

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
check (role in ('management','admin','employee'));

-- Marc bleibt Geschäftsführung und wird eingeplant
update profiles
set role='management',
    department='Restaurantleitung',
    plannable=true,
    active=true
where email='marc.alexxander@gmail.com';

-- Standard für normale Mitarbeiter
update profiles
set department='Service'
where (department is null or department='')
and role='employee';

update profiles
set plannable=true
where plannable is null;

create or replace function is_admin()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('management','admin')
    and active = true
  );
$$;

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
for select using (auth.uid() is not null and active = true);

drop policy if exists "profiles_admin_insert" on profiles;
create policy "profiles_admin_insert" on profiles
for insert with check (is_admin());

drop policy if exists "profiles_admin_update" on profiles;
create policy "profiles_admin_update" on profiles
for update using (is_admin() or id = auth.uid())
with check (is_admin() or id = auth.uid());

drop policy if exists "schedules_select" on schedules;
create policy "schedules_select" on schedules
for select using (auth.uid() is not null);

drop policy if exists "schedules_admin_write" on schedules;
create policy "schedules_admin_write" on schedules
for all using (is_admin()) with check (is_admin());
