-- Actual PostgreSQL/RLS integration test. All fixture data is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','digitalx-test-a@example.invalid','{"full_name":"Teste A"}'),
('10000000-0000-4000-8000-000000000002','digitalx-test-b@example.invalid','{"full_name":"Teste B"}'),
('10000000-0000-4000-8000-000000000003','digitalx-test-c@example.invalid','{"full_name":"Teste C"}');
insert into storage.objects(bucket_id,name,metadata) values('status-files','10000000-0000-4000-8000-000000000001/test', '{"size":100,"mimetype":"image/png"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare c uuid; d uuid; begin
 if (select count(*) from public.profiles where id::text like '10000000-%')<>3 then raise exception 'FAIL profile trigger'; end if;
 c:=public.create_conversation('Teste DIGITALX',array['10000000-0000-4000-8000-000000000002'::uuid],true);
 perform set_config('digitalx.test_group',c::text,true);
 d:=public.create_conversation('',array['10000000-0000-4000-8000-000000000002'::uuid],false);
 if d<>public.create_conversation('',array['10000000-0000-4000-8000-000000000002'::uuid],false) then raise exception 'FAIL duplicate direct conversation'; end if;
 perform public.send_message(c,'Mensagem de A');
 insert into public.statuses(user_id,path,caption) values(auth.uid(),auth.uid()::text||'/test','Status real em transação de teste');
 if (select expires_at-created_at from public.statuses where user_id=auth.uid())<>interval '24 hours' then raise exception 'FAIL status expiry'; end if;
 insert into public.user_presence(user_id,last_seen_at) values(auth.uid(),now()+interval '1 year');
 if (select last_seen_at from public.user_presence where user_id=auth.uid())<>now() then raise exception 'FAIL presence clock'; end if;
 begin perform email from public.profiles; raise exception 'FAIL private email exposed'; exception when insufficient_privilege then null; end;
 begin insert into public.messages(conversation_id,sender_id,body) values(c,auth.uid(),'bypass'); raise exception 'FAIL direct write allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; begin
 if (select count(*) from public.messages where conversation_id=c)<>1 then raise exception 'FAIL B cannot read A'; end if;
 perform public.send_message(c,'Resposta de B');
 perform public.mark_read(c);
 if (select count(*) from public.statuses where user_id='10000000-0000-4000-8000-000000000001')<>1 then raise exception 'FAIL connected status access'; end if;
 begin perform public.manage_group(c,'edit',null,'Sem permissão',''); raise exception 'FAIL member can edit'; exception when raise_exception then if sqlerrm<>'Permissão administrativa obrigatória' then raise; end if; end;
 begin perform public.manage_group(c,'add','10000000-0000-4000-8000-000000000003'); raise exception 'FAIL member can add users'; exception when raise_exception then if sqlerrm<>'Permissão administrativa obrigatória' then raise; end if; end;
 begin update public.messages set body='Ataque' where conversation_id=c and sender_id='10000000-0000-4000-8000-000000000001'; raise exception 'FAIL messages update authorized'; exception when insufficient_privilege then null; end;
 begin update public.conversation_members set role='owner' where conversation_id=c and user_id=auth.uid(); raise exception 'FAIL self-promotion authorized'; exception when insufficient_privilege then null; end;
 begin update public.profiles set name='Ataque' where id='10000000-0000-4000-8000-000000000001'; if found then raise exception 'FAIL profile changed by another user'; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; begin
 if exists(select 1 from jsonb_array_elements(public.list_conversations()) item where item->>'id'=c::text) then raise exception 'FAIL outsider private conversation list'; end if;
 if exists(select 1 from public.messages where conversation_id=c) or exists(select 1 from public.conversations where id=c) then raise exception 'FAIL outsider read'; end if;
 if exists(select 1 from public.statuses where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'FAIL outsider status read'; end if;
 if exists(select 1 from storage.objects where bucket_id='status-files' and name='10000000-0000-4000-8000-000000000001/test') then raise exception 'FAIL outsider file read'; end if;
 begin perform public.send_message(c,'Ataque'); raise exception 'FAIL outsider send'; exception when raise_exception then if sqlerrm<>'Acesso negado à conversa' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.manage_group(current_setting('digitalx.test_group')::uuid,'add','10000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.messages where conversation_id=current_setting('digitalx.test_group')::uuid)<>2 then raise exception 'FAIL added member access'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.manage_group(current_setting('digitalx.test_group')::uuid,'remove','10000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin if exists(select 1 from public.messages where conversation_id=current_setting('digitalx.test_group')::uuid) then raise exception 'FAIL removed member access'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.manage_group(current_setting('digitalx.test_group')::uuid,'leave');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if (select role from public.conversation_members where conversation_id=current_setting('digitalx.test_group')::uuid and user_id=auth.uid())<>'owner' then raise exception 'FAIL owner transfer'; end if; end $$;
select 'PASS: profiles, private email, DM deduplication, messages and reads, group permissions, outsider isolation, add/remove, owner transfer, private status, 24h expiry, server presence, direct-write/update denial and self-promotion denial' as result;
rollback;
