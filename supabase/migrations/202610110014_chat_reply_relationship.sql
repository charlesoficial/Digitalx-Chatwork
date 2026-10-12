-- Explicit recursive relationship, with both source and original protected by RLS.
-- https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#recursive-relationships
begin;
create function public.replied_message(p_message public.messages)
returns setof public.messages rows 1 language sql stable security invoker set search_path='' as $$
 select original.* from public.messages source
 join public.messages original on original.id=source.reply_to_id
   and original.conversation_id=source.conversation_id
 where source.id=(p_message).id;
$$;
revoke all on function public.replied_message(public.messages) from public,anon;
grant execute on function public.replied_message(public.messages) to authenticated;
notify pgrst, 'reload schema';
commit;
