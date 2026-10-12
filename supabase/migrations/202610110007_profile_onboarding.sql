begin;

-- Completion is private account state, writable only through the authenticated RPC.
alter table public.profiles add column onboarding_completed_at timestamptz;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp']);

create policy avatars_insert on storage.objects for insert to authenticated
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy avatars_read on storage.objects for select to authenticated
using (bucket_id='avatars' and ((storage.foldername(name))[1]=auth.uid()::text
  or exists(select 1 from public.profiles p where p.avatar_url='storage://avatars/'||name)));
-- Owners can clean up unpublished uploads, never delete a published profile photo.
create policy avatars_delete_unpublished on storage.objects for delete to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text
  and not exists(select 1 from public.profiles p where p.avatar_url='storage://avatars/'||name));

create function public.get_onboarding_profile() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object('id',id,'name',name,'username',username,'bio',bio,
    'avatar_url',avatar_url,'digitalx_id',digitalx_id,'onboarding_completed_at',onboarding_completed_at)
  into result from public.profiles where id=auth.uid();
  if result is null then raise exception 'Profile not available'; end if;
  return result;
end $$;

create function public.complete_profile_onboarding(p_name text,p_bio text,
  p_avatar_path text default null,p_google_photo boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account uuid:=auth.uid(); photo text;
begin
  if account is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80
    or p_bio is null or length(p_bio)>240 then
    raise exception 'Informe um nome de até 80 caracteres e uma bio de até 240 caracteres.' using errcode='22023';
  end if;
  if p_avatar_path is not null and p_google_photo then raise exception 'Invalid photo selection' using errcode='22023'; end if;
  if p_avatar_path is not null then
    if p_avatar_path !~ ('^'||account::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
      or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_avatar_path
        and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
        and (metadata->>'size')::bigint between 1 and 5242880) then
      raise exception 'A foto precisa ser uma imagem enviada pela sua própria conta.' using errcode='42501';
    end if;
    photo:='storage://avatars/'||p_avatar_path;
  elsif p_google_photo then
    -- Restoring the user's original Google photo never accepts an arbitrary caller URL.
    select coalesce(raw_user_meta_data->>'avatar_url',raw_user_meta_data->>'picture') into photo
    from auth.users where id=account;
    if photo is not null and photo !~ '^https://' then photo:=null; end if;
  end if;
  update public.profiles set name=btrim(p_name),bio=p_bio,
    avatar_url=case when p_avatar_path is not null or p_google_photo then photo else avatar_url end,
    onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=account;
  if not found then raise exception 'Profile not available'; end if;
  return public.get_onboarding_profile();
end $$;

revoke all on function public.get_onboarding_profile() from public,anon,authenticated;
revoke all on function public.complete_profile_onboarding(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.get_onboarding_profile() to authenticated;
grant execute on function public.complete_profile_onboarding(text,text,text,boolean) to authenticated;
commit;
