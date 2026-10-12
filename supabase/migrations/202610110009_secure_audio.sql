-- P2P only: SDP contains public fingerprints/ICE, never private certificates or media keys.
begin;
create table public.secure_audio_calls (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id),
 caller_id uuid not null references public.profiles(id),
 callee_id uuid not null references public.profiles(id),
 offer jsonb not null,
 answer jsonb,
 state text not null default 'ringing' check(state in ('ringing','connecting','ended','declined')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '60 seconds',
 check(caller_id<>callee_id)
);
create index secure_audio_caller on public.secure_audio_calls(caller_id,created_at desc);
create index secure_audio_callee on public.secure_audio_calls(callee_id,created_at desc);
alter table public.secure_audio_calls enable row level security;
revoke all on public.secure_audio_calls from anon,authenticated;

create function public.valid_audio_signal(p jsonb,p_type text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
 and p->>'type'=p_type and char_length(p->>'sdp') between 100 and 65536
 and p->>'sdp' like '%a=fingerprint:sha-256 %'
 and p->>'sdp' like '%UDP/TLS/RTP/SAVPF%'
 and p->>'sdp' like '%m=audio %'
 and p->>'sdp' not like '%m=video %'
 and p->>'sdp' like '%m=application %'
 and p->>'device' ~ '^[0-9a-f-]{36}$',false)
$$;
revoke all on function public.valid_audio_signal(jsonb,text) from public,anon,authenticated;

create function public.start_secure_audio_call(p_conversation uuid,p_offer jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); peer uuid; c public.secure_audio_calls%rowtype; lock_id uuid;
begin
 if uid is null or not public.is_member(p_conversation) then raise exception 'Conversa não autorizada'; end if;
 if not exists(select 1 from public.conversations where id=p_conversation and not is_group)
 or (select count(*) from public.conversation_members where conversation_id=p_conversation)<>2
 then raise exception 'Chamadas em grupo aguardam distribuição segura de chaves'; end if;
 select user_id into peer from public.conversation_members where conversation_id=p_conversation and user_id<>uid;
 for lock_id in select x from unnest(array[uid,peer]) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('digitalx-call:'||lock_id::text,0));
 end loop;
 if not public.valid_audio_signal(p_offer,'offer') then raise exception 'Negociação segura inválida'; end if;
 if (select count(*) from public.secure_audio_calls where caller_id=uid and created_at>now()-interval '1 minute')>=6
 then raise exception 'Limite de chamadas. Aguarde um minuto.'; end if;
 if exists(select 1 from public.secure_audio_calls where (caller_id in (uid,peer) or callee_id in (uid,peer)) and state in ('ringing','connecting') and expires_at>now())
 then raise exception 'Um participante já está em outra chamada'; end if;
 insert into public.secure_audio_calls(conversation_id,caller_id,callee_id,offer)
 values(p_conversation,uid,peer,p_offer) returning * into c;
 return to_jsonb(c);
end $$;

create function public.get_secure_audio_call(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.secure_audio_calls%rowtype;
begin
 if uid is null then raise exception 'Autenticação obrigatória'; end if;
 select * into c from public.secure_audio_calls s
 where (s.caller_id=uid or s.callee_id=uid)
 and exists(select 1 from public.conversation_members m where m.conversation_id=s.conversation_id and m.user_id=s.caller_id)
 and exists(select 1 from public.conversation_members m where m.conversation_id=s.conversation_id and m.user_id=s.callee_id)
 and ((p_id is not null and s.id=p_id) or (p_id is null and s.callee_id=uid and s.state='ringing' and s.expires_at>now()))
 order by s.created_at desc limit 1;
 if c.id is null then return null; end if;
 if c.expires_at<=now() then c.state:='ended'; end if;
 return to_jsonb(c);
end $$;

create function public.update_secure_audio_call(p_id uuid,p_action text,p_answer jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.secure_audio_calls%rowtype;
begin
 select * into c from public.secure_audio_calls where id=p_id and (caller_id=uid or callee_id=uid) for update;
 if uid is null or c.id is null then raise exception 'Chamada não autorizada'; end if;
 if p_action='end' or (p_action='decline' and uid=c.callee_id) then
  update public.secure_audio_calls set state=case when p_action='decline' then 'declined' else 'ended' end,
   offer=jsonb_build_object('type','expired'),answer=null,expires_at=now() where id=p_id returning * into c;
 elsif p_action='answer' and uid=c.callee_id and c.state='ringing' and c.expires_at>now()
 and public.is_member(c.conversation_id)
 and exists(select 1 from public.conversation_members where conversation_id=c.conversation_id and user_id=c.caller_id) then
  if not public.valid_audio_signal(p_answer,'answer') then raise exception 'Negociação segura inválida'; end if;
  update public.secure_audio_calls set answer=p_answer,state='connecting',expires_at=now()+interval '2 hours' where id=p_id returning * into c;
 else raise exception 'Estado de chamada inválido ou expirado'; end if;
 return to_jsonb(c);
end $$;

revoke all on function public.start_secure_audio_call(uuid,jsonb),public.get_secure_audio_call(uuid),public.update_secure_audio_call(uuid,text,jsonb) from public,anon;
grant execute on function public.start_secure_audio_call(uuid,jsonb),public.get_secure_audio_call(uuid),public.update_secure_audio_call(uuid,text,jsonb) to authenticated;
commit;
