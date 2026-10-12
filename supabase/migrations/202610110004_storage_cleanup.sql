begin;
-- Explicit paths avoid a same-name column in an inner query shadowing the object name.
create function public.can_cleanup_chat_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select split_part(p_path,'/',2)=auth.uid()::text
 and exists(select 1 from public.conversation_members cm where cm.conversation_id::text=split_part(p_path,'/',1) and cm.user_id=auth.uid())
 and not exists(select 1 from public.attachments a where a.path=p_path);
$$;
revoke all on function public.can_cleanup_chat_file(text) from public,anon;
grant execute on function public.can_cleanup_chat_file(text) to authenticated;
drop policy chat_file_cleanup on storage.objects;
create policy chat_file_cleanup on storage.objects for delete to authenticated using(bucket_id='chat-files' and public.can_cleanup_chat_file(name));
commit;
