-- Actual PostgreSQL integration test; synthetic Auth insertion is rolled back.
-- Tests first-login provisioning through the existing Auth -> profile triggers.
begin;
do $$ begin
 if (select count(*) from public.conversations where is_main)<>1 then raise exception 'FAIL official group uniqueness'; end if;
 if not exists(select 1 from public.conversations where is_main and title='DIGITALX • NETWORK' and id='023cdbba-8f97-4177-9c8d-7bee509d006e') then raise exception 'FAIL official title'; end if;
 if exists(select 1 from public.profiles p where not exists(select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id where c.is_main and m.user_id=p.id)) then raise exception 'FAIL existing account enrollment'; end if;
 if not exists(select 1 from public.conversation_members where conversation_id='023cdbba-8f97-4177-9c8d-7bee509d006e' and user_id='c0650fc5-19c4-49d9-84b2-19f28c3938d3' and role='owner') then raise exception 'FAIL owner role lost'; end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','network-test@example.invalid','{"full_name":"NETWORK ROLLBACK TEST"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare rows jsonb:=public.list_conversations(); begin
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'FAIL Auth profile creation'; end if;
 if (select count(*) from public.conversation_members where user_id=auth.uid() and conversation_id='023cdbba-8f97-4177-9c8d-7bee509d006e' and role='member')<>1 then raise exception 'FAIL automatic enrollment'; end if;
 if rows->0->>'is_main' is distinct from 'true' or rows->0->>'title' is distinct from 'DIGITALX • NETWORK' then raise exception 'FAIL official group list'; end if;
 if exists(select 1 from public.conversations where id='25ef928b-45ed-4960-8b85-4759108f91b1') then raise exception 'FAIL unrelated private DM visible'; end if;
 if public.shares_conversation('c0650fc5-19c4-49d9-84b2-19f28c3938d3') then raise exception 'FAIL community exposes unrelated private status'; end if;
 begin update public.conversations set is_main=true where not is_main; raise exception 'FAIL member can self-verify'; exception when insufficient_privilege then null; end;
 begin update public.conversation_members set role='admin' where user_id=auth.uid(); raise exception 'FAIL member can self-promote'; exception when insufficient_privilege then null; end;
end $$;
-- A newer private conversation must not displace the principal group.
select public.create_conversation('Unpinned rollback test',array['c0650fc5-19c4-49d9-84b2-19f28c3938d3'::uuid],true);
do $$ begin
 if public.list_conversations()->0->>'is_main' is distinct from 'true' then raise exception 'FAIL principal group not pinned'; end if;
end $$;
select 'PASS: main group, existing accounts, owner preserved, Auth/profile auto-enrollment, default member role, pinned ordering, private DM/status boundaries, verification and role escalation denied' as result;
rollback;
