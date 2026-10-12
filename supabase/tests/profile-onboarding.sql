-- Auth/profile and Storage policy integration checks. All synthetic rows roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('81000000-0000-4000-8000-000000000001','setup-a@example.invalid','{"full_name":"Setup A","avatar_url":"https://example.invalid/original.png"}'),
 ('81000000-0000-4000-8000-000000000002','setup-b@example.invalid','{"full_name":"Setup B"}');
insert into storage.objects(bucket_id,name,metadata) values
 ('avatars','81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003.png','{"mimetype":"image/png","size":100}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='avatars' and name like '81000000-%') then raise exception 'FAIL unpublished photo exposed'; end if;
 begin perform public.complete_profile_onboarding('Setup B','','81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003.png'); raise exception 'FAIL foreign photo accepted'; exception when insufficient_privilege then null; end;
 begin update public.profiles set onboarding_completed_at=now() where id=auth.uid(); raise exception 'FAIL completion timestamp writable'; exception when insufficient_privilege then null; end;
 begin update public.profiles set avatar_url='https://example.invalid/unsafe' where id=auth.uid(); raise exception 'FAIL avatar writable'; exception when insufficient_privilege then null; end;
 begin perform onboarding_completed_at from public.profiles; raise exception 'FAIL completion state exposed'; exception when insufficient_privilege then null; end;
 begin perform public.complete_profile_onboarding('  ',''); raise exception 'FAIL empty name accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.complete_profile_onboarding('B',repeat('x',241)); raise exception 'FAIL excessive bio accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare before_state jsonb:=public.get_onboarding_profile(); after_state jsonb; completion text; begin
 if before_state->>'onboarding_completed_at' is not null then raise exception 'FAIL new profile already complete'; end if;
 if before_state ? 'email' then raise exception 'FAIL private email exposed'; end if;
 if before_state->>'digitalx_id' !~ '^1[0-9]{8}$' then raise exception 'FAIL permanent ID'; end if;
 if not exists(select 1 from public.conversation_members where user_id=auth.uid() and conversation_id='023cdbba-8f97-4177-9c8d-7bee509d006e') then raise exception 'FAIL main enrollment lost'; end if;
 begin perform public.complete_profile_onboarding('A','','81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000099.png'); raise exception 'FAIL nonexistent photo accepted'; exception when insufficient_privilege then null; end;
 after_state:=public.complete_profile_onboarding('  Setup A renamed  ','Minha bio');
 if after_state->>'name'<>'Setup A renamed' or after_state->>'bio'<>'Minha bio' or after_state->>'avatar_url'<>'https://example.invalid/original.png' then raise exception 'FAIL profile save/preserve Google photo'; end if;
 if after_state->>'digitalx_id'<>before_state->>'digitalx_id' or after_state->>'onboarding_completed_at' is null then raise exception 'FAIL ID/completion'; end if;
 completion:=after_state->>'onboarding_completed_at';
 after_state:=public.complete_profile_onboarding('Setup A renamed','Minha bio','81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003.png');
 if after_state->>'avatar_url'<>'storage://avatars/81000000-0000-4000-8000-000000000001/81000000-0000-4000-8000-000000000003.png' or after_state->>'onboarding_completed_at'<>completion then raise exception 'FAIL photo publish/idempotent timestamp'; end if;

 if not exists(select 1 from storage.objects where bucket_id='avatars' and name like '81000000-%') then raise exception 'FAIL published photo removable'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='avatars' and name like '81000000-%') then raise exception 'FAIL published photo unreadable'; end if;
 if public.get_onboarding_profile()->>'name'<>'Setup B' or public.get_onboarding_profile()->>'onboarding_completed_at' is not null then raise exception 'FAIL own state isolation'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if public.complete_profile_onboarding('Setup A renamed','Minha bio',null,true)->>'avatar_url'<>'https://example.invalid/original.png' then raise exception 'FAIL trusted Google photo restore'; end if;

 if not exists(select 1 from storage.objects where bucket_id='avatars' and name like '81000000-%') then raise exception 'FAIL owner lost unpublished photo'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin perform public.get_onboarding_profile(); raise exception 'FAIL anonymous own profile read'; exception when insufficient_privilege then null; end;
 begin perform public.complete_profile_onboarding('Anonymous',''); raise exception 'FAIL anonymous completion'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='avatars') then raise exception 'FAIL anonymous avatars visible'; end if;
end $$;
select 'PASS: new account gate, private own state, validation, save, immutable ID, original photo, private upload/publish, other-user denial, anonymous denial, main enrollment, repeated completion' as result;
rollback;
