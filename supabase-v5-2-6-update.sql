-- Dienstplan Landsknecht v5.2.6 SQL Update
-- Grundlage für späteres Minijob-Center

alter table profiles add column if not exists contract_type text default 'minijob';
alter table profiles add column if not exists hourly_rate numeric(10,2) default 0;

alter table profiles drop constraint if exists profiles_contract_type_check;
alter table profiles add constraint profiles_contract_type_check
check (
  contract_type is null or contract_type in (
    'minijob',
    'teilzeit',
    'vollzeit',
    'geschaeftsfuehrung'
  )
);

update profiles
set contract_type='geschaeftsfuehrung'
where email='marc.alexxander@gmail.com';

update profiles
set contract_type='minijob'
where department in ('Minijob Service','Minijob Bar')
and (contract_type is null or contract_type='minijob');
