-- Read-only production preflight. Both queries must return zero rows before
-- applying migration 013. Do not automatically merge or remove any rows.
select partnership_id, count(*) as member_count
from public.partnership_members
group by partnership_id
having count(*) > 2;

with pairs as (
 select min(m.user_id::text) as first_user_id, max(m.user_id::text) as second_user_id,
        m.partnership_id
 from public.partnership_members m
 join public.partnerships p on p.id=m.partnership_id
 where p.disconnected_at is null
 group by m.partnership_id
 having count(*) = 2
)
select first_user_id, second_user_id, count(*) as active_connection_count,
       array_agg(partnership_id) as partnership_ids
from pairs
group by first_user_id, second_user_id
having count(*) > 1;
