-- Run A and B in independent SQL Editor sessions at the same time. Rollback only.
begin;
insert into auth.users(id,email,raw_user_meta_data)
 select ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'id-concurrency-'||n||'@example.invalid','{"full_name":"ID CONCURRENCY ROLLBACK"}'::jsonb
 from generate_series(1,50) n;
-- Keep reservations uncommitted while the other session creates its accounts.
select pg_sleep(8);
do $$ begin
 if (select count(distinct digitalx_id) from public.profiles where id between '61000000-0000-4000-8000-000000000001' and '61000000-0000-4000-8000-000000000050' and digitalx_id ~ '^1[0-9]{8}$')<>50 then raise exception 'FAIL concurrent batch A'; end if;
end $$;
select 'PASS A: 50 unique IDs from simultaneous Auth provisioning; rollback' as result;
rollback;
