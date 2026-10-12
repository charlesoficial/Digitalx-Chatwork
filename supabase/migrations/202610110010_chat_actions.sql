-- Additive chat interactions. No existing message or object is deleted.
begin;
alter table public.messages add column reply_to_id uuid references public.messages(id) on delete set null,
 add column edited_at timestamptz, add column deleted_at timestamptz,
 add column forwarded boolean not null default false, add column client_nonce uuid;
create unique index messages_sender_nonce on public.messages(sender_id,client_nonce) where client_nonce is not null;
create index messages_reply_idx on public.messages(reply_to_id) where reply_to_id is not null;
create table public.message_hidden (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(message_id,user_id)
);
create table public.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 emoji text check(emoji is null or emoji in ('❤️','😂','👍','🔥','😮','😢')),
 updated_at timestamptz not null default now(), primary key(message_id,user_id)
);
create index message_hidden_user on public.message_hidden(user_id,message_id);
create index message_reactions_conversation on public.message_reactions(conversation_id);
alter table public.message_hidden enable row level security;
alter table public.message_reactions enable row level security;
-- Definer helper avoids recursive policies and never discloses message text.
create function public.can_read_message(p_message uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.messages m where m.id=p_message and public.is_member(m.conversation_id)
 and not exists(select 1 from public.message_hidden h where h.message_id=m.id and h.user_id=auth.uid()));
$$;
revoke all on function public.can_read_message(uuid) from public,anon;
grant execute on function public.can_read_message(uuid) to authenticated;
drop policy messages_member_read on public.messages;
create policy messages_member_read on public.messages for select to authenticated using(public.can_read_message(id));
drop policy attachments_member_read on public.attachments;
create policy attachments_member_read on public.attachments for select to authenticated using(public.can_read_message(message_id) and exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null));
create policy hidden_self_read on public.message_hidden for select to authenticated using(user_id=auth.uid() and public.is_member(conversation_id));
create policy reactions_member_read on public.message_reactions for select to authenticated using(public.can_read_message(message_id) and exists(select 1 from public.messages m where m.id=message_id and m.deleted_at is null));
revoke all on public.message_hidden,public.message_reactions from public,anon,authenticated;
grant select on public.message_hidden,public.message_reactions to authenticated;

create function public.send_message_v2(p_conversation uuid,p_body text,p_attachment jsonb default null,p_reply uuid default null,p_nonce uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; uid uuid:=auth.uid(); obj storage.objects%rowtype; existing public.messages%rowtype;
begin
 if uid is null or not public.is_member(p_conversation) then raise exception 'Acesso negado à conversa'; end if;
 if p_nonce is not null then
  perform pg_advisory_xact_lock(hashtextextended(uid::text||p_nonce::text,0));
  select * into existing from public.messages where sender_id=uid and client_nonce=p_nonce;
  if found then
   if existing.conversation_id<>p_conversation then raise exception 'Identificador de envio inválido'; end if;
   return existing.id;
  end if;
 end if;
 if char_length(trim(coalesce(p_body,'')))=0 and p_attachment is null then raise exception 'Mensagem vazia'; end if;
 if char_length(coalesce(p_body,''))>8000 then raise exception 'Mensagem deve ter até 8000 caracteres'; end if;
 if p_reply is not null and not exists(select 1 from public.messages where id=p_reply and conversation_id=p_conversation and public.can_read_message(id) and deleted_at is null) then raise exception 'Resposta indisponível'; end if;
 if p_attachment is not null then
  if split_part(p_attachment->>'path','/',1)<>p_conversation::text or split_part(p_attachment->>'path','/',2)<>uid::text then raise exception 'Caminho de anexo inválido'; end if;
  select * into obj from storage.objects where bucket_id='chat-files' and name=p_attachment->>'path';
  if obj.id is null or (obj.metadata->>'size')::bigint<>(p_attachment->>'size')::bigint or obj.metadata->>'mimetype'<>p_attachment->>'mime_type' then raise exception 'Arquivo não encontrado ou metadados inválidos'; end if;
  if exists(select 1 from public.attachments where path=p_attachment->>'path') then raise exception 'Anexo já publicado'; end if;
 end if;
 insert into public.messages(conversation_id,sender_id,body,reply_to_id,client_nonce) values(p_conversation,uid,trim(coalesce(p_body,'')),p_reply,p_nonce) returning id into mid;
 if p_attachment is not null then
  insert into public.attachments(message_id,conversation_id,name,path,mime_type,size) values(mid,p_conversation,p_attachment->>'name',p_attachment->>'path',p_attachment->>'mime_type',(p_attachment->>'size')::bigint);
 end if;
 update public.conversations set updated_at=now() where id=p_conversation;
 return mid;
end;
$$;
-- Old clients keep working while a new PWA version rolls out.
create or replace function public.send_message(p_conversation uuid,p_body text,p_attachment jsonb default null) returns uuid language sql security definer set search_path='' as $$
 select public.send_message_v2(p_conversation,p_body,p_attachment,null,null);
$$;
create function public.edit_message(p_message uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype;
begin
 select * into m from public.messages where id=p_message for update;
 if m.id is null or not public.can_read_message(m.id) or m.sender_id<>auth.uid() then raise exception 'Só o autor pode editar esta mensagem'; end if;
 if m.deleted_at is not null or exists(select 1 from public.attachments where message_id=m.id) or m.created_at<now()-interval '15 minutes' then raise exception 'Edição permitida apenas para texto nos primeiros 15 minutos'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 8000 then raise exception 'Texto deve ter de 1 a 8000 caracteres'; end if;
 update public.messages set body=trim(p_body),edited_at=now() where id=m.id;
end;
$$;
create function public.hide_messages(p_messages uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(cardinality(p_messages),0) not between 1 and 100 then raise exception 'Selecione de 1 a 100 mensagens'; end if;
 if exists(select 1 from unnest(p_messages) id where id is null or not public.can_read_message(id)) then raise exception 'Mensagem inacessível'; end if;
 insert into public.message_hidden(message_id,user_id,conversation_id) select id,auth.uid(),conversation_id from public.messages where id=any(p_messages) on conflict do nothing;
end;
$$;
create function public.delete_message_for_all(p_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype;
begin
 select * into m from public.messages where id=p_message for update;
 if m.id is null or not public.can_read_message(m.id) or m.sender_id<>auth.uid() then raise exception 'Só o autor pode apagar para todos'; end if;
 if m.created_at<now()-interval '48 hours' then raise exception 'Apagar para todos disponível por 48 horas'; end if;
 update public.messages set body='',deleted_at=coalesce(deleted_at,now()) where id=m.id;
 -- Keep attachments and objects: independently forwarded records may still use them.
 update public.message_reactions set emoji=null,updated_at=now() where message_id=m.id;
end;
$$;
create function public.react_message(p_message uuid,p_emoji text) returns void language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype;
begin
 select * into m from public.messages where id=p_message for update;
 if m.id is null or not public.can_read_message(m.id) or m.deleted_at is not null then raise exception 'Mensagem inacessível'; end if;
 if p_emoji is not null and p_emoji not in ('❤️','😂','👍','🔥','😮','😢') then raise exception 'Reação inválida'; end if;
 -- Explicit desired state makes retries idempotent. Null retracts without a DELETE broadcast.
 insert into public.message_reactions(message_id,user_id,conversation_id,emoji) values(m.id,auth.uid(),m.conversation_id,p_emoji)
 on conflict(message_id,user_id) do update set emoji=excluded.emoji,updated_at=now();
end;
$$;

-- Authorized forwards create separate records while retaining the immutable blob.
alter table public.attachments drop constraint attachments_path_key;
create index attachments_path_idx on public.attachments(path);
create function public.forward_messages(p_messages uuid[],p_conversation uuid,p_nonce uuid) returns uuid[] language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); source public.messages%rowtype; mid uuid; output uuid[]:='{}'; nonce uuid; i integer:=0;
begin
 if uid is null or not public.is_member(p_conversation) then raise exception 'Acesso negado ao destino'; end if;
 if p_nonce is null or coalesce(cardinality(p_messages),0) not between 1 and 100 or cardinality(p_messages)<>(select count(distinct id) from unnest(p_messages) id) then raise exception 'Seleção inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_nonce::text,0));
 -- Validate entire batch before creating anything. Source content never comes from the browser.
 if exists(select 1 from unnest(p_messages) as requested(id) where requested.id is null or not public.can_read_message(requested.id) or not exists(select 1 from public.messages m where m.id=requested.id and m.deleted_at is null)) then raise exception 'Mensagem inacessível'; end if;
 for source in select * from public.messages where id=any(p_messages) order by created_at,id loop
  i:=i+1;
  nonce:=md5(p_nonce::text||':'||source.id::text)::uuid;
  select id into mid from public.messages where sender_id=uid and client_nonce=nonce and conversation_id=p_conversation;
  if mid is null then
   insert into public.messages(conversation_id,sender_id,body,forwarded,client_nonce) values(p_conversation,uid,source.body,true,nonce) returning id into mid;
   insert into public.attachments(message_id,conversation_id,name,path,mime_type,size) select mid,p_conversation,name,path,mime_type,size from public.attachments where message_id=source.id;
  end if;
  output:=array_append(output,mid);
 end loop;
 update public.conversations set updated_at=now() where id=p_conversation;
 return output;
end;
$$;
create function public.can_download_chat_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a join public.messages m on m.id=a.message_id where a.path=p_path and m.deleted_at is null and public.can_read_message(m.id))
 or (split_part(p_path,'/',2)=auth.uid()::text and exists(select 1 from public.conversation_members cm where cm.user_id=auth.uid() and cm.conversation_id::text=split_part(p_path,'/',1)) and not exists(select 1 from public.attachments where path=p_path));
$$;
revoke all on function public.can_download_chat_file(text) from public,anon;
grant execute on function public.can_download_chat_file(text) to authenticated;
drop policy chat_file_download on storage.objects;
create policy chat_file_download on storage.objects for select to authenticated using(bucket_id='chat-files' and public.can_download_chat_file(name));

revoke all on function public.send_message_v2(uuid,text,jsonb,uuid,uuid),public.edit_message(uuid,text),public.hide_messages(uuid[]),public.delete_message_for_all(uuid),public.react_message(uuid,text),public.forward_messages(uuid[],uuid,uuid) from public,anon;
grant execute on function public.send_message_v2(uuid,text,jsonb,uuid,uuid),public.edit_message(uuid,text),public.hide_messages(uuid[]),public.delete_message_for_all(uuid),public.react_message(uuid,text),public.forward_messages(uuid[],uuid,uuid) to authenticated;
alter publication supabase_realtime add table public.message_reactions,public.message_hidden;
-- Definer list must observe the same per-user visibility as table reads.
create or replace function public.list_conversations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by is_main desc,updated_at desc),'[]'::jsonb) from (
 select c.is_main,c.updated_at,jsonb_build_object(
  'id',c.id,'title',c.title,'is_group',c.is_group,'is_main',c.is_main,'description',c.description,'updated_at',c.updated_at,
  'members',(select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'role',cm.role,'last_read_at',cm.last_read_at,'profile',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio))) from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=c.id),
  'last',(select jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_id',m.sender_id,'body',case when m.deleted_at is not null then 'Esta mensagem foi apagada' else m.body end,'deleted_at',m.deleted_at,'created_at',m.created_at,'sender',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio),'attachments',case when m.deleted_at is not null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(a)) from public.attachments a where a.message_id=m.id),'[]'::jsonb) end) from public.messages m join public.profiles p on p.id=m.sender_id where m.conversation_id=c.id and public.can_read_message(m.id) order by m.created_at desc,m.id desc limit 1),
  'unread',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.created_at>own.last_read_at and m.deleted_at is null and public.can_read_message(m.id))
 ) as row_data from public.conversations c join public.conversation_members own on own.conversation_id=c.id and own.user_id=auth.uid()
 ) authorized;
$$;
commit;
