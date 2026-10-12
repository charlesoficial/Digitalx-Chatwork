begin;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,username,email,avatar_url) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1),'Membro'),80),replace(new.id::text,'-',''),new.email,new.raw_user_meta_data->>'avatar_url');
 return new;
end;
$$;
-- One authorized round trip replaces two requests per conversation.
create function public.list_conversations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row_data order by updated_at desc),'[]'::jsonb) from (
 select c.updated_at,jsonb_build_object(
  'id',c.id,'title',c.title,'is_group',c.is_group,'description',c.description,'updated_at',c.updated_at,
  'members',(select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'role',cm.role,'last_read_at',cm.last_read_at,'profile',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio))) from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=c.id),
  'last',(select jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_id',m.sender_id,'body',m.body,'created_at',m.created_at,'sender',jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio),'attachments',coalesce((select jsonb_agg(to_jsonb(a)) from public.attachments a where a.message_id=m.id),'[]'::jsonb)) from public.messages m join public.profiles p on p.id=m.sender_id where m.conversation_id=c.id order by m.created_at desc limit 1),
  'unread',(select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.created_at>own.last_read_at)
 ) as row_data from public.conversations c join public.conversation_members own on own.conversation_id=c.id and own.user_id=auth.uid()
 ) authorized;
$$;
revoke all on function public.list_conversations() from public,anon;
grant execute on function public.list_conversations() to authenticated;
commit;
