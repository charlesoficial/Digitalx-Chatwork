-- Explicit computed relationship preserves sender:profiles(...) in older PWAs.
-- https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#overriding-relationships
-- Invoker privileges + message RLS remain authoritative. Use stored sender_id,
-- never trust the composite input's sender; populate only public profile fields.
begin;
create function public.profiles(p_message public.messages) returns setof public.profiles rows 1 language sql stable security invoker set search_path='' as $$
 select jsonb_populate_record(null::public.profiles,jsonb_build_object(
  'id',p.id,'name',p.name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'created_at',p.created_at))
 from public.messages m join public.profiles p on p.id=m.sender_id where m.id=(p_message).id;
$$;
revoke all on function public.profiles(public.messages) from public,anon;
grant execute on function public.profiles(public.messages) to authenticated;
notify pgrst, 'reload schema';
commit;
