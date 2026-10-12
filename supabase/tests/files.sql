-- Storage RLS and attachment integrity; metadata-only fixtures are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','digitalx-file-a@example.invalid','{"full_name":"File A"}'),
('20000000-0000-4000-8000-000000000002','digitalx-file-b@example.invalid','{"full_name":"File B"}'),
('20000000-0000-4000-8000-000000000003','digitalx-file-c@example.invalid','{"full_name":"File C"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('digitalx.test_group',public.create_conversation('Teste de arquivos',array['20000000-0000-4000-8000-000000000002'::uuid],true)::text,true);
reset role;
insert into storage.objects(bucket_id,name,metadata) values('chat-files',current_setting('digitalx.test_group')||'/20000000-0000-4000-8000-000000000001/test','{"size":100,"mimetype":"application/pdf"}');
update public.conversation_members set last_read_at=now()-interval '1 hour' where conversation_id=current_setting('digitalx.test_group')::uuid and user_id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; a jsonb; begin
 a:=jsonb_build_object('name','teste.pdf','path',c::text||'/'||auth.uid()::text||'/test','size',100,'mime_type','application/pdf');
 perform public.send_message(c,'Arquivo privado',a);
 if not exists(select 1 from public.attachments where conversation_id=c) then raise exception 'FAIL attachment persistence'; end if;
 if public.can_cleanup_chat_file(a->>'path') then raise exception 'FAIL published object cleanup authorized'; end if;
 if not public.can_cleanup_chat_file(c::text||'/'||auth.uid()::text||'/orphan') then raise exception 'FAIL orphan cleanup denied'; end if;
 begin delete from storage.objects where bucket_id='chat-files' and name=a->>'path'; if found then raise exception 'FAIL published object deleted'; end if; exception when insufficient_privilege then null; end;
 begin perform public.send_message(c,'',jsonb_set(a,'{size}','999')); raise exception 'FAIL forged attachment size'; exception when raise_exception then if sqlerrm<>'Arquivo não encontrado ou metadados inválidos' then raise; end if; end;
 begin perform public.send_message(c,'',jsonb_set(a,'{path}',to_jsonb('missing'::text))); raise exception 'FAIL forged attachment path'; exception when raise_exception then if sqlerrm<>'Caminho de anexo inválido' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; begin
 if not exists(select 1 from storage.objects where bucket_id='chat-files' and split_part(name,'/',1)=c::text) then raise exception 'FAIL participant file read'; end if;
 if (select (value->>'unread')::int from jsonb_array_elements(public.list_conversations()) where value->>'id'=c::text)<>1 then raise exception 'FAIL unread count'; end if;
 perform public.mark_read(c);
 if (select (value->>'unread')::int from jsonb_array_elements(public.list_conversations()) where value->>'id'=c::text)<>0 then raise exception 'FAIL mark read'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; begin
 if exists(select 1 from storage.objects where bucket_id='chat-files' and split_part(name,'/',1)=c::text) or exists(select 1 from public.attachments where conversation_id=c) then raise exception 'FAIL outsider file read'; end if;
 begin insert into storage.objects(bucket_id,name) values('chat-files',c::text||'/'||auth.uid()::text||'/attack'); raise exception 'FAIL outsider upload'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.manage_group(current_setting('digitalx.test_group')::uuid,'remove','20000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare c uuid:=current_setting('digitalx.test_group')::uuid; begin
 if exists(select 1 from storage.objects where bucket_id='chat-files' and split_part(name,'/',1)=c::text) or exists(select 1 from public.attachments where conversation_id=c) then raise exception 'FAIL removed member file read'; end if;
 begin perform public.send_message(c,'Ataque após remoção'); raise exception 'FAIL removed member send'; exception when raise_exception then if sqlerrm<>'Acesso negado à conversa' then raise; end if; end;
end $$;
select 'PASS: attachment integrity, participant access, outsider read/upload denial, published-object protection, unread/mark read, removed-member file and send denial' as result;
rollback;
