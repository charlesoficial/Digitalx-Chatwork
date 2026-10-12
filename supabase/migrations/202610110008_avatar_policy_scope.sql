begin;
-- Qualify the object name: profiles also has a name column in these subqueries.
alter policy avatars_read on storage.objects to authenticated
using (bucket_id='avatars' and ((storage.foldername(name))[1]=auth.uid()::text
  or exists(select 1 from public.profiles p where p.avatar_url='storage://avatars/'||storage.objects.name)));
alter policy avatars_delete_unpublished on storage.objects to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
  and not exists(select 1 from public.profiles p where p.avatar_url='storage://avatars/'||storage.objects.name));
commit;
