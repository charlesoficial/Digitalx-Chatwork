-- DIGITALX foundation. Apply once, transactionally, to the designated project.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80),
 username text unique not null check (username ~ '^[a-z0-9_.]{3,32}$'),
 email text, avatar_url text, bio text not null default '' check (char_length(bio)<=240),
 created_at timestamptz not null default now()
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), title text,
 is_group boolean not null default false, description text not null default '' check(char_length(description)<=500),
 created_by uuid references public.profiles(id) on delete set null,
 direct_key text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (not is_group or char_length(title) between 1 and 80)
);
create table public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','admin','member')),
 last_read_at timestamptz not null default now(), joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create index members_user_idx on public.conversation_members(user_id,conversation_id);
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id), body text not null default '' check(char_length(body)<=8000),
 created_at timestamptz not null default now()
);
create index messages_history_idx on public.messages(conversation_id,created_at desc);
create table public.attachments (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.messages(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 255), path text unique not null,
 mime_type text not null, size bigint not null check(size>0 and size<=26214400), created_at timestamptz not null default now()
);
create index attachments_conversation_idx on public.attachments(conversation_id,created_at desc);
create table public.user_presence (user_id uuid primary key references public.profiles(id) on delete cascade,last_seen_at timestamptz not null default now());
create table public.statuses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 path text unique not null, caption text not null default '' check(char_length(caption)<=240),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours',
 check(expires_at=created_at+interval '24 hours')
);
create index statuses_expiry_idx on public.statuses(expires_at,user_id);
create table public.calls (
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,
 created_by uuid not null references public.profiles(id),kind text not null check(kind in ('audio','video')),
 state text not null default 'pending' check(state in ('pending','ringing','active','ended','missed','rejected')),
 created_at timestamptz not null default now(),ended_at timestamptz
);
create table public.call_participants (call_id uuid references public.calls(id) on delete cascade,user_id uuid references public.profiles(id),joined_at timestamptz,left_at timestamptz,primary key(call_id,user_id));

-- Definer helpers prevent recursive membership policies. The caller's JWT remains authoritative.
create function public.is_member(p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members where conversation_id=p_conversation and user_id=auth.uid());
$$;
create function public.shares_conversation(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user=auth.uid() or exists(select 1 from public.conversation_members a join public.conversation_members b on a.conversation_id=b.conversation_id where a.user_id=auth.uid() and b.user_id=p_user);
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,username,email,avatar_url)
 values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1),'Membro'),80),'u_'||left(replace(new.id::text,'-',''),30),new.email,new.raw_user_meta_data->>'avatar_url');
 return new;
end;
$$;
create trigger digitalx_auth_profile after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,name,username,email,avatar_url)
 select id,left(coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1),'Membro'),80),'u_'||left(replace(id::text,'-',''),30),email,raw_user_meta_data->>'avatar_url' from auth.users on conflict(id) do nothing;

create function public.create_conversation(p_title text,p_participants uuid[],p_group boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid; uid uuid:=auth.uid(); participant uuid; dk text;
begin
 if uid is null then raise exception 'Autenticação obrigatória'; end if;
 if coalesce(cardinality(p_participants),0)<1 or cardinality(p_participants)>99 then raise exception 'Selecione de 1 a 99 participantes'; end if;
 if exists(select 1 from unnest(p_participants) p where p is null or p=uid or not exists(select 1 from public.profiles where id=p)) then raise exception 'Participante inválido'; end if;
 if not p_group then
  if cardinality(p_participants)<>1 then raise exception 'Uma conversa individual tem dois participantes'; end if;
  dk:=least(uid::text,p_participants[1]::text)||':'||greatest(uid::text,p_participants[1]::text);
  perform pg_advisory_xact_lock(hashtextextended(dk,0));
  select id into cid from public.conversations where direct_key=dk;
  if cid is not null then return cid; end if;
 elsif coalesce(char_length(trim(p_title)),0) not between 1 and 80 then raise exception 'Nome do grupo obrigatório (máximo 80 caracteres)';
 end if;
 insert into public.conversations(title,is_group,created_by,direct_key) values(case when p_group then trim(p_title) else null end,p_group,uid,dk) returning id into cid;
 insert into public.conversation_members(conversation_id,user_id,role) values(cid,uid,'owner');
 for participant in select distinct unnest(p_participants) loop
  insert into public.conversation_members(conversation_id,user_id,role) values(cid,participant,'member');
 end loop;
 return cid;
end;
$$;
create function public.send_message(p_conversation uuid,p_body text,p_attachment jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; uid uuid:=auth.uid(); obj storage.objects%rowtype;
begin
 if uid is null or not public.is_member(p_conversation) then raise exception 'Acesso negado à conversa'; end if;
 if char_length(trim(coalesce(p_body,'')))=0 and p_attachment is null then raise exception 'Mensagem vazia'; end if;
 if p_attachment is not null then
  if split_part(p_attachment->>'path','/',1)<>p_conversation::text or split_part(p_attachment->>'path','/',2)<>uid::text then raise exception 'Caminho de anexo inválido'; end if;
  select * into obj from storage.objects where bucket_id='chat-files' and name=p_attachment->>'path';
  if obj.id is null or (obj.metadata->>'size')::bigint<>(p_attachment->>'size')::bigint or obj.metadata->>'mimetype'<>p_attachment->>'mime_type' then raise exception 'Arquivo não encontrado ou metadados inválidos'; end if;
 end if;
 insert into public.messages(conversation_id,sender_id,body) values(p_conversation,uid,trim(coalesce(p_body,''))) returning id into mid;
 if p_attachment is not null then
  insert into public.attachments(message_id,conversation_id,name,path,mime_type,size) values(mid,p_conversation,p_attachment->>'name',p_attachment->>'path',p_attachment->>'mime_type',(p_attachment->>'size')::bigint);
 end if;
 update public.conversations set updated_at=now() where id=p_conversation;
 return mid;
end;
$$;
create function public.mark_read(p_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(p_conversation) then raise exception 'Acesso negado'; end if;
 update public.conversation_members set last_read_at=now() where conversation_id=p_conversation and user_id=auth.uid();
end;
$$;
create function public.manage_group(p_conversation uuid,p_action text,p_user uuid default null,p_title text default null,p_description text default null) returns void language plpgsql security definer set search_path='' as $$
declare myrole text; targetrole text; nextowner uuid;
begin
 perform 1 from public.conversations where id=p_conversation and is_group for update;
 if not found then raise exception 'Grupo não encontrado'; end if;
 select role into myrole from public.conversation_members where conversation_id=p_conversation and user_id=auth.uid();
 if myrole is null then raise exception 'Acesso negado'; end if;
 if p_action='leave' then
  if myrole='owner' then
   select user_id into nextowner from public.conversation_members where conversation_id=p_conversation and user_id<>auth.uid() order by case role when 'admin' then 0 else 1 end,joined_at,user_id limit 1;
   if nextowner is not null then update public.conversation_members set role='owner' where conversation_id=p_conversation and user_id=nextowner; end if;
  end if;
  delete from public.conversation_members where conversation_id=p_conversation and user_id=auth.uid();
 elsif myrole not in ('owner','admin') then raise exception 'Permissão administrativa obrigatória';
 elsif p_action='edit' then
  update public.conversations set title=trim(p_title),description=coalesce(p_description,''),updated_at=now() where id=p_conversation;
 elsif p_action='add' then
  if (select count(*) from public.conversation_members where conversation_id=p_conversation)>=100 then raise exception 'Limite de 100 participantes'; end if;
  insert into public.conversation_members(conversation_id,user_id) values(p_conversation,p_user) on conflict do nothing;
 elsif p_action='remove' then
  select role into targetrole from public.conversation_members where conversation_id=p_conversation and user_id=p_user;
  if p_user=auth.uid() or targetrole='owner' or (targetrole='admin' and myrole<>'owner') then raise exception 'Não é permitido remover este participante'; end if;
  delete from public.conversation_members where conversation_id=p_conversation and user_id=p_user;
 else raise exception 'Operação inválida';
 end if;
 update public.conversations set updated_at=now() where id=p_conversation;
end;
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.user_presence enable row level security;
alter table public.statuses enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
create policy profiles_directory on public.profiles for select to authenticated using(true);
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy conversations_member_read on public.conversations for select to authenticated using(public.is_member(id));
create policy members_member_read on public.conversation_members for select to authenticated using(public.is_member(conversation_id));
create policy messages_member_read on public.messages for select to authenticated using(public.is_member(conversation_id));
create policy attachments_member_read on public.attachments for select to authenticated using(public.is_member(conversation_id));
create policy presence_read on public.user_presence for select to authenticated using(public.shares_conversation(user_id));
create policy presence_insert on public.user_presence for insert to authenticated with check(user_id=auth.uid());
create policy presence_update on public.user_presence for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy presence_delete on public.user_presence for delete to authenticated using(user_id=auth.uid());
create policy statuses_read on public.statuses for select to authenticated using(expires_at>now() and public.shares_conversation(user_id));
create policy statuses_insert on public.statuses for insert to authenticated with check(user_id=auth.uid() and split_part(path,'/',1)=auth.uid()::text and expires_at=created_at+interval '24 hours' and created_at<=now() and created_at>now()-interval '1 minute' and exists(select 1 from storage.objects where bucket_id='status-files' and name=path));
create policy calls_read on public.calls for select to authenticated using(public.is_member(conversation_id));
create policy call_participants_read on public.call_participants for select to authenticated using(exists(select 1 from public.calls c where c.id=call_id and public.is_member(c.conversation_id)));

-- Never expose emails in the contact directory. The current user's email comes from Auth.
revoke all on public.profiles,public.conversations,public.conversation_members,public.messages,public.attachments,public.user_presence,public.statuses,public.calls,public.call_participants from anon,authenticated;
grant select(id,name,username,avatar_url,bio,created_at) on public.profiles to authenticated;
grant update(name,username,bio) on public.profiles to authenticated;
grant select on public.conversations,public.conversation_members,public.messages,public.attachments,public.statuses,public.calls,public.call_participants to authenticated;
grant select,insert,update,delete on public.user_presence to authenticated;
grant insert(user_id,path,caption) on public.statuses to authenticated;
revoke all on function public.is_member(uuid),public.shares_conversation(uuid),public.handle_new_user(),public.create_conversation(text,uuid[],boolean),public.send_message(uuid,text,jsonb),public.mark_read(uuid),public.manage_group(uuid,text,uuid,text,text) from public,anon;
grant execute on function public.is_member(uuid),public.shares_conversation(uuid),public.create_conversation(text,uuid[],boolean),public.send_message(uuid,text,jsonb),public.mark_read(uuid),public.manage_group(uuid,text,uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('chat-files','chat-files',false,26214400,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav','application/pdf','application/zip','application/x-zip-compressed','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain']),
 ('status-files','status-files',false,26214400,array['image/jpeg','image/png','image/webp']);
create policy chat_file_upload on storage.objects for insert to authenticated with check(bucket_id='chat-files' and split_part(name,'/',2)=auth.uid()::text and exists(select 1 from public.conversation_members where conversation_id::text=split_part(name,'/',1) and user_id=auth.uid()));
create policy chat_file_download on storage.objects for select to authenticated using(bucket_id='chat-files' and exists(select 1 from public.conversation_members where conversation_id::text=split_part(name,'/',1) and user_id=auth.uid()));
-- Only an unpublished upload may be cleaned up by the sender.
create policy chat_file_cleanup on storage.objects for delete to authenticated using(bucket_id='chat-files' and split_part(name,'/',2)=auth.uid()::text and exists(select 1 from public.conversation_members where conversation_id::text=split_part(name,'/',1) and user_id=auth.uid()) and not exists(select 1 from public.attachments where path=name));
create policy status_file_upload on storage.objects for insert to authenticated with check(bucket_id='status-files' and split_part(name,'/',1)=auth.uid()::text);
create policy status_file_download on storage.objects for select to authenticated using(bucket_id='status-files' and exists(select 1 from public.statuses s where s.path=name and s.expires_at>now() and public.shares_conversation(s.user_id)));
create policy status_file_cleanup on storage.objects for delete to authenticated using(bucket_id='status-files' and split_part(name,'/',1)=auth.uid()::text and not exists(select 1 from public.statuses where path=name));

alter publication supabase_realtime add table public.messages,public.conversations,public.conversation_members;
commit;
