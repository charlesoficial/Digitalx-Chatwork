begin;
alter table public.conversations drop constraint conversations_check;
alter table public.conversations add constraint conversations_check check(not is_group or (title is not null and char_length(title) between 1 and 80));
create function public.stamp_presence() returns trigger language plpgsql set search_path='' as $$ begin new.last_seen_at=now(); return new; end; $$;
create trigger presence_server_clock before insert or update on public.user_presence for each row execute function public.stamp_presence();
revoke all on function public.stamp_presence() from public,anon,authenticated;
-- Publishing checks Storage outside its read policy; unpublished status objects are private.
create function public.has_status_upload(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select split_part(p_path,'/',1)=auth.uid()::text and exists(select 1 from storage.objects where bucket_id='status-files' and name=p_path and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') and (metadata->>'size')::bigint between 1 and 26214400);
$$;
revoke all on function public.has_status_upload(text) from public,anon;
grant execute on function public.has_status_upload(text) to authenticated;
drop policy statuses_insert on public.statuses;
create policy statuses_insert on public.statuses for insert to authenticated with check(user_id=auth.uid() and public.has_status_upload(path) and expires_at=created_at+interval '24 hours' and created_at<=now() and created_at>now()-interval '1 minute');
commit;
