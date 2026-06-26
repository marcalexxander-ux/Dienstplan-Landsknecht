-- Dienstplan Landsknecht v5.2.1 SQL Update
-- Drag & Drop Reihenfolge

alter table profiles add column if not exists sort_order integer;

with ordered as (
  select id, row_number() over (
    order by
      case
        when department = 'Restaurantleitung' then 10
        when department = 'Service' then 20
        when department = 'Minijob Service' then 30
        when department = 'Bar' then 40
        when department = 'Minijob Bar' then 50
        when department = 'Küche' then 60
        when department = 'Spüler' then 70
        when department = 'Reinigung' then 80
        else 999
      end,
      last_name,
      first_name
  ) as rn
  from profiles
  where active = true
)
update profiles p
set sort_order = ordered.rn
from ordered
where p.id = ordered.id
and p.sort_order is null;
