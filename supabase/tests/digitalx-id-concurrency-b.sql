-- Start while session A is still sleeping. No persistent test accounts.
begin;
insert into auth.users(id,email,raw_user_meta_data)
 select ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'id-concurrency-'||n||'@example.invalid','{"full_name":"ID CONCURRENCY ROLLBACK"}'::jsonb
 from generate_series(51,100) n;
select pg_sleep(2);
do $$ begin
 if (select count(distinct digitalx_id) from public.profiles where id between '61000000-0000-4000-8000-000000000051' and '61000000-0000-4000-8000-000000000100' and digitalx_id ~ '^1[0-9]{8}$')<>50 then raise exception 'FAIL concurrent batch B'; end if;
end $$;
select 'PASS B: 50 unique IDs from simultaneous Auth provisioning; rollback' as result;
rollback;
