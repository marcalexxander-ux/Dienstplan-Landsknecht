-- Dienstplan Landsknecht v4.1 SQL Update

alter table profiles add column if not exists department text;
alter table profiles add column if not exists plannable boolean not null default true;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists active boolean not null default true;

alter table profiles drop constraint if exists profiles_department_check;
alter table profiles add constraint profiles_department_check
check (
  department is null or department in (
    'Restaurantleitung',
    'Service',
    'Minijob Service',
    'Bar',
    'Minijob Bar',
    'Küche',
    'Reinigung',
    'Spüler'
  )
);

update profiles
set role='management',
    department='Restaurantleitung',
    plannable=true,
    active=true
where email='marc.alexxander@gmail.com';

update profiles
set department='Service'
where (department is null or department='')
and role='employee';

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
