-- Live database integration assertions. All fixtures and forced RNG are rolled back.
begin;
do $$ begin
 if exists(select 1 from public.profiles where digitalx_id !~ '^1[0-9]{8}$') then raise exception 'FAIL backfill format'; end if;
 if (select count(*) from public.profiles)<>(select count(distinct digitalx_id) from public.profiles) then raise exception 'FAIL uniqueness'; end if;
 if exists(select 1 from public.profiles p left join public.digitalx_id_registry r on r.user_id=p.id and r.digitalx_id=p.digitalx_id where r.user_id is null) then raise exception 'FAIL reservation mismatch'; end if;
 if has_column_privilege('authenticated','public.profiles','digitalx_id','SELECT') or has_column_privilege('authenticated','public.profiles','digitalx_id','UPDATE') then raise exception 'FAIL ID directory exposure'; end if;
 if has_function_privilege('anon','public.find_user_by_digitalx_id(text)','EXECUTE') or has_function_privilege('authenticated','public.allocate_digitalx_id(uuid)','EXECUTE') then raise exception 'FAIL privileged RPC exposed'; end if;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('digitalx_id_registry','digitalx_id_search_limits') and c.relrowsecurity)<>2 then raise exception 'FAIL internal RLS'; end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('60000000-0000-4000-8000-000000000001','id-test-a@example.invalid','{"full_name":"ID Test A"}'),
 ('60000000-0000-4000-8000-000000000002','id-test-b@example.invalid','{"full_name":"ID Test B"}');
select set_config('digitalx.test_a_id',(select digitalx_id from public.profiles where id='60000000-0000-4000-8000-000000000001'),true);
select set_config('digitalx.test_b_id',(select digitalx_id from public.profiles where id='60000000-0000-4000-8000-000000000002'),true);
do $$ begin
 if public.allocate_digitalx_id('60000000-0000-4000-8000-000000000001')<>current_setting('digitalx.test_a_id') then raise exception 'FAIL reassignment'; end if;
 begin update public.profiles set digitalx_id='100000000' where id='60000000-0000-4000-8000-000000000001'; raise exception 'FAIL immutable trigger'; exception when raise_exception then if sqlerrm<>'O ID DIGITALX é permanente e não pode ser alterado' then raise; end if; end;
end $$;
-- Force a collision, then a free candidate. The same production allocator must retry.
select set_config('digitalx.test_free_id',(select n::text from generate_series(100000000,100000100) n where not exists(select 1 from public.digitalx_id_registry where digitalx_id=n::text) limit 1),true);
create temporary sequence id_collision_sequence;
create or replace function public.random_digitalx_id() returns text language plpgsql volatile set search_path='' as $$
begin
 if nextval('pg_temp.id_collision_sequence')=1 then return current_setting('digitalx.test_a_id'); end if;
 return current_setting('digitalx.test_free_id');
end;
$$;
insert into auth.users(id,email,raw_user_meta_data) values('60000000-0000-4000-8000-000000000003','id-test-c@example.invalid','{"full_name":"ID Collision Test"}');
do $$ begin
 if (select digitalx_id from public.profiles where id='60000000-0000-4000-8000-000000000003')<>current_setting('digitalx.test_free_id') or currval('pg_temp.id_collision_sequence')<>2 then raise exception 'FAIL collision retry'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare result jsonb; begin
 if public.get_my_digitalx_id()<>current_setting('digitalx.test_a_id') then raise exception 'FAIL own identifier'; end if;
 update public.profiles set name='ID Test A Edited',bio='edited' where id=auth.uid();
 if public.get_my_digitalx_id()<>current_setting('digitalx.test_a_id') then raise exception 'FAIL profile edit changed ID'; end if;
 begin perform digitalx_id from public.profiles; raise exception 'FAIL ID enumeration'; exception when insufficient_privilege then null; end;
 begin update public.profiles set digitalx_id='100000001' where id=auth.uid(); raise exception 'FAIL frontend ID mutation'; exception when insufficient_privilege then null; end;
 begin perform * from public.digitalx_id_registry; raise exception 'FAIL registry access'; exception when insufficient_privilege then null; end;
 begin perform public.find_user_by_digitalx_id('123'); raise exception 'FAIL short input'; exception when raise_exception then if sqlerrm<>'Informe 9 dígitos começando por 1' then raise; end if; end;
 begin perform public.find_user_by_digitalx_id('212345678'); raise exception 'FAIL wrong prefix'; exception when raise_exception then if sqlerrm<>'Informe 9 dígitos começando por 1' then raise; end if; end;
 for i in 1..10 loop
  result:=public.find_user_by_digitalx_id(current_setting('digitalx.test_b_id'));
  if result->'user'->>'name' is distinct from 'ID Test B' then raise exception 'FAIL lookup'; end if;
  if result->'user' ? 'email' or result->'user' ? 'bio' or result->'user' ? 'username' then raise exception 'FAIL private lookup data'; end if;
 end loop;
 if public.find_user_by_digitalx_id(current_setting('digitalx.test_b_id'))->>'error' is distinct from 'rate_limited' then raise exception 'FAIL minute quota'; end if;
end $$;
reset role;
do $$ declare result jsonb; begin
 for batch in 1..5 loop
  update public.digitalx_id_search_limits set minute_started_at=now()-interval '2 minutes' where user_id='60000000-0000-4000-8000-000000000001';
  for i in 1..10 loop result:=public.find_user_by_digitalx_id(current_setting('digitalx.test_b_id')); end loop;
 end loop;
 -- The rejected minute request also counts towards the hourly bound.
 if result->>'error' is distinct from 'rate_limited' then raise exception 'FAIL hour quota'; end if;
end $$;
select 'PASS: backfill, prefix/length/text, uniqueness, Auth provisioning, permanent ID, forced collision retry, restricted grants/RLS, exact minimal lookup, minute/hour quotas' as result;
rollback;
