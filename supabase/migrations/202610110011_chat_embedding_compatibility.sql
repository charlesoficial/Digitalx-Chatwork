-- Avoid implicit many-to-many profiles embeddings in older PWA clients.
-- Preserve unique (message,user), rows, authorization and Realtime updates.
begin;
alter table public.message_hidden add column id uuid not null default gen_random_uuid();
alter table public.message_hidden drop constraint message_hidden_pkey;
alter table public.message_hidden add primary key(id), add unique(message_id,user_id);
alter table public.message_reactions add column id uuid not null default gen_random_uuid();
alter table public.message_reactions drop constraint message_reactions_pkey;
alter table public.message_reactions add primary key(id), add unique(message_id,user_id);
notify pgrst, 'reload schema';
commit;
