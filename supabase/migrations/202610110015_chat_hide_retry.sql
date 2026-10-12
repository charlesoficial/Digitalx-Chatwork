-- A lost success response must allow retrying the same self-only hide operation.
begin;
create or replace function public.hide_messages(p_messages uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(cardinality(p_messages),0) not between 1 and 100 then
  raise exception 'Selecione de 1 a 100 mensagens';
 end if;
 if exists(select 1 from unnest(p_messages) requested(id)
   where requested.id is null or not exists(
    select 1 from public.messages m where m.id=requested.id and public.is_member(m.conversation_id)
   )) then raise exception 'Mensagem inacessível'; end if;
 insert into public.message_hidden(message_id,user_id,conversation_id)
 select id,auth.uid(),conversation_id from public.messages where id=any(p_messages)
 on conflict do nothing;
end;
$$;
notify pgrst, 'reload schema';
commit;
