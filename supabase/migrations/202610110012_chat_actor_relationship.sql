-- Reactions/hidden markers identify Auth principals, without an additional
-- messages -> profiles join path inferred by PostgREST in old PWA queries.
-- Only these new tables change; no Auth user or existing profile is modified.
begin;
alter table public.message_hidden drop constraint message_hidden_user_id_fkey;
alter table public.message_hidden add constraint message_hidden_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.message_reactions drop constraint message_reactions_user_id_fkey;
alter table public.message_reactions add constraint message_reactions_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
notify pgrst, 'reload schema';
commit;
