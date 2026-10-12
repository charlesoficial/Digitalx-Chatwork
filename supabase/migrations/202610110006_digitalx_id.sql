-- Permanent public identifier, never an authentication credential.
-- Random source: https://www.postgresql.org/docs/current/pgcrypto.html#PGCRYPTO-RANDOM-DATA-FUNCS
begin;
create table public.digitalx_id_registry (
 digitalx_id text primary key check(digitalx_id ~ '^1[0-9]{8}$'),
 user_id uuid unique not null references auth.users(id) on delete cascade
);
alter table public.digitalx_id_registry enable row level security;
revoke all on public.digitalx_id_registry from public,anon,authenticated;

create function public.random_digitalx_id() returns text language plpgsql volatile set search_path='' as $$
declare bytes bytea; number bigint;
begin
 loop
  bytes:=extensions.gen_random_bytes(4);
  number:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
  -- Rejection sampling avoids modulo bias across the 100 million identifiers.
  if number<4200000000 then return '1'||lpad((number%100000000)::text,8,'0'); end if;
 end loop;
end;
$$;
revoke all on function public.random_digitalx_id() from public,anon,authenticated;

create function public.allocate_digitalx_id(p_user uuid) returns text language plpgsql volatile security definer set search_path='' as $$
declare assigned text; candidate text;
begin
 for attempt in 1..128 loop
  select digitalx_id into assigned from public.digitalx_id_registry where user_id=p_user;
  if assigned is not null then return assigned; end if;
  candidate:=public.random_digitalx_id();
  -- UNIQUE arbitrates concurrent attempts. A collision waits, then retries safely.
  insert into public.digitalx_id_registry(digitalx_id,user_id) values(candidate,p_user)
   on conflict do nothing returning digitalx_id into assigned;
  if assigned is not null then return assigned; end if;
 end loop;
 raise exception 'Não foi possível atribuir o ID DIGITALX. Tente novamente.';
end;
$$;
revoke all on function public.allocate_digitalx_id(uuid) from public,anon,authenticated;

alter table public.profiles add column digitalx_id text;
create function public.protect_digitalx_id() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.digitalx_id is null then
  if new.digitalx_id is not null then raise exception 'O ID DIGITALX é gerado pelo servidor'; end if;
  new.digitalx_id:=public.allocate_digitalx_id(new.id);
 elsif new.digitalx_id is distinct from old.digitalx_id then
  raise exception 'O ID DIGITALX é permanente e não pode ser alterado';
 end if;
 return new;
end;
$$;
revoke all on function public.protect_digitalx_id() from public,anon,authenticated;
create trigger digitalx_id_immutable before insert or update on public.profiles
 for each row execute function public.protect_digitalx_id();
update public.profiles set digitalx_id=null where digitalx_id is null;
alter table public.profiles alter column digitalx_id set not null;
alter table public.profiles add constraint profiles_digitalx_id_unique unique(digitalx_id);
alter table public.profiles add constraint profiles_digitalx_id_format check(digitalx_id ~ '^1[0-9]{8}$');
-- Keep existing safe column grants. No SELECT/UPDATE grant on digitalx_id.
create function public.get_my_digitalx_id() returns text language sql stable security definer set search_path='' as $$
 select digitalx_id from public.profiles where id=auth.uid();
$$;
revoke all on function public.get_my_digitalx_id() from public,anon;
grant execute on function public.get_my_digitalx_id() to authenticated;

create table public.digitalx_id_search_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 minute_started_at timestamptz not null,minute_count integer not null,
 hour_started_at timestamptz not null,hour_count integer not null
);
alter table public.digitalx_id_search_limits enable row level security;
revoke all on public.digitalx_id_search_limits from public,anon,authenticated;
create function public.find_user_by_digitalx_id(p_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare caller uuid:=auth.uid(); stamp timestamptz:=clock_timestamp(); quota public.digitalx_id_search_limits; found_user jsonb;
begin
 if caller is null then raise exception 'Autenticação obrigatória' using errcode='42501'; end if;
 if p_id is null or p_id !~ '^1[0-9]{8}$' then raise exception 'Informe 9 dígitos começando por 1'; end if;
 insert into public.digitalx_id_search_limits(user_id,minute_started_at,minute_count,hour_started_at,hour_count)
 values(caller,stamp,1,stamp,1)
 on conflict(user_id) do update set
  minute_started_at=case when stamp-digitalx_id_search_limits.minute_started_at>=interval '1 minute' then stamp else digitalx_id_search_limits.minute_started_at end,
  minute_count=case when stamp-digitalx_id_search_limits.minute_started_at>=interval '1 minute' then 1 else least(digitalx_id_search_limits.minute_count+1,11) end,
  hour_started_at=case when stamp-digitalx_id_search_limits.hour_started_at>=interval '1 hour' then stamp else digitalx_id_search_limits.hour_started_at end,
  hour_count=case when stamp-digitalx_id_search_limits.hour_started_at>=interval '1 hour' then 1 else least(digitalx_id_search_limits.hour_count+1,61) end
 returning * into quota;
 if quota.minute_count>10 or quota.hour_count>60 then
  -- Return instead of throwing: a thrown error would roll back the quota write.
  return jsonb_build_object('error','rate_limited','retry_after',greatest(1,ceil(extract(epoch from (
   case when quota.hour_count>60 then quota.hour_started_at+interval '1 hour' else quota.minute_started_at+interval '1 minute' end-stamp)))::integer));
 end if;
 select jsonb_build_object('id',id,'name',name,'avatar_url',avatar_url,'digitalx_id',digitalx_id)
 into found_user from public.profiles where digitalx_id=p_id;
 return jsonb_build_object('user',found_user);
end;
$$;
revoke all on function public.find_user_by_digitalx_id(text) from public,anon;
grant execute on function public.find_user_by_digitalx_id(text) to authenticated;
commit;
