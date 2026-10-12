-- Promote the existing, user-selected group. Apply only to mlsnyxzirlzpgkpdfmma.
begin;
do $$ begin
 if not exists(select 1 from public.conversations where id='023cdbba-8f97-4177-9c8d-7bee509d006e' and is_group and created_by='c0650fc5-19c4-49d9-84b2-19f28c3938d3') then
  raise exception 'Designated DIGITALX group missing; stop instead of creating another group';
 end if;
end $$;

-- Only server-side administrators can designate the official group.
alter table public.conversations add column is_main boolean not null default false;
alter table public.conversations add constraint main_conversation_is_group check(not is_main or is_group);
create unique index conversations_single_main on public.conversations(is_main) where is_main;
update public.conversations set title='DIGITALX • NETWORK',
 description='Grupo principal da DIGITALX. Juntos somos mais fortes.',
 is_main=true,updated_at=now()
 where id='023cdbba-8f97-4177-9c8d-7bee509d006e';

-- Auth creates the profile; this trigger enrolls each new profile atomically.
-- No browser-side enrollment or privileged frontend key is needed.
create function public.join_main_group() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.conversation_members(conversation_id,user_id,role)
 select id,new.id,'member' from public.conversations where is_main
 on conflict(conversation_id,user_id) do nothing;
 return new;
end;
$$;
revoke all on function public.join_main_group() from public,anon,authenticated;
create trigger digitalx_main_membership after insert on public.profiles
 for each row execute function public.join_main_group();
-- Include current accounts while preserving owner/admin roles and read markers.
insert into public.conversation_members(conversation_id,user_id,role)
 select c.id,p.id,'member' from public.conversations c cross join public.profiles p where c.is_main
 on conflict(conversation_id,user_id) do nothing;

-- Community membership must not disclose unrelated private status uploads.
create or replace function public.shares_conversation(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user=auth.uid() or exists(
  select 1 from public.conversation_members a
  join public.conversation_members b on a.conversation_id=b.conversation_id
  join public.conversations c on c.id=a.conversation_id
  where a.user_id=auth.uid() and b.user_id=p_user and not c.is_main
 );
$$;

create or replace function public.list_conversations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by is_main desc,updated_at desc),'[]'::jsonb) from (
 select c.is_main,c.updated_at,jsonb_build_object(
  'id',c.id,'title',c.title,'is_group',c.is_group,'is_main',c.is_main,'description',c.description,'updated_at',c.updated_at,
  'members',(select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'role',cm.role,'last_read_at',cm.last_read_at,'profile',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio))) from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=c.id),
  'last',(select jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_id',m.sender_id,'body',m.body,'created_at',m.created_at,'sender',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio),'attachments',coalesce((select jsonb_agg(to_jsonb(a)) from public.attachments a where a.message_id=m.id),'[]'::jsonb)) from public.messages m join public.profiles p on p.id=m.sender_id where m.conversation_id=c.id order by m.created_at desc limit 1),
  'unread',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.created_at>own.last_read_at)
 ) as row_data from public.conversations c join public.conversation_members own on own.conversation_id=c.id and own.user_id=auth.uid()
 ) authorized;
$$;
revoke all on function public.list_conversations() from public,anon;
grant execute on function public.list_conversations() to authenticated;
commit;
