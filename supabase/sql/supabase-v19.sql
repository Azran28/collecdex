-- CollecDex v19 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v18.sql)
-- Scans de test envoyés automatiquement au labo de Claude (seulement les comptes « testeurs ») :
--  • labo_testers : la liste des comptes testeurs (invisible depuis le site ; on s'y ajoute ici, à la main) ;
--  • labo_scans   : un scan par ligne (licence, carte trouvée, version décidée, ta réponse…), lisible seulement par son auteur ;
--  • stockage « labo » (privé) : la photo de chaque scan, dans le dossier du compte.
--  • Un compte qui n'est pas testeur ne peut rien envoyer ni lire. On peut relancer ce script sans risque.

create table if not exists public.labo_testers (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.labo_testers enable row level security; -- (aucune règle : personne ne la lit ni ne la modifie depuis le site)
revoke all on public.labo_testers from anon, authenticated;

-- Suis-je testeur ? (le site le demande avant d'envoyer quoi que ce soit)
create or replace function public.labo_is_tester()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.labo_testers where user_id = auth.uid());
$$;
revoke all on function public.labo_is_tester() from public, anon;
grant execute on function public.labo_is_tester() to authenticated;

create table if not exists public.labo_scans (
  id text primary key check (id ~ '^[a-z0-9]{6,40}$'),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  game text not null check (game ~ '^[a-z]{2,20}$'),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16384)
);
create index if not exists labo_scans_user_time on public.labo_scans (user_id, created_at desc);
alter table public.labo_scans enable row level security;
revoke all on public.labo_scans from anon;
grant select, insert, update, delete on public.labo_scans to authenticated;

-- Au plus 2 000 scans par compte (le site efface lui-même les plus anciens au-delà de 500)
create or replace function public.labo_quota_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 2000 from public.labo_scans where user_id = auth.uid();
$$;
revoke all on function public.labo_quota_ok() from public, anon;
grant execute on function public.labo_quota_ok() to authenticated;

drop policy if exists "labo: lire les siens" on public.labo_scans;
create policy "labo: lire les siens" on public.labo_scans for select to authenticated
  using (user_id = (select auth.uid()) and public.labo_is_tester());
drop policy if exists "labo: ajouter les siens" on public.labo_scans;
create policy "labo: ajouter les siens" on public.labo_scans for insert to authenticated
  with check (user_id = (select auth.uid()) and public.labo_is_tester() and public.labo_quota_ok());
drop policy if exists "labo: modifier les siens" on public.labo_scans;
create policy "labo: modifier les siens" on public.labo_scans for update to authenticated
  using (user_id = (select auth.uid()) and public.labo_is_tester())
  with check (user_id = (select auth.uid()) and public.labo_is_tester());
drop policy if exists "labo: effacer les siens" on public.labo_scans;
create policy "labo: effacer les siens" on public.labo_scans for delete to authenticated
  using (user_id = (select auth.uid()));

-- Photos des scans : stockage privé « labo », 1 Mo par photo, WebP ou JPEG, dossier = identifiant du compte
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('labo', 'labo', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/webp', 'image/jpeg'];

drop policy if exists "labo: lire ses photos" on storage.objects;
create policy "labo: lire ses photos" on storage.objects for select to authenticated
  using (bucket_id = 'labo' and (storage.foldername(name))[1] = (select auth.uid())::text and public.labo_is_tester());
drop policy if exists "labo: ajouter ses photos" on storage.objects;
create policy "labo: ajouter ses photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'labo' and (storage.foldername(name))[1] = (select auth.uid())::text and public.labo_is_tester());
drop policy if exists "labo: modifier ses photos" on storage.objects;
create policy "labo: modifier ses photos" on storage.objects for update to authenticated
  using (bucket_id = 'labo' and (storage.foldername(name))[1] = (select auth.uid())::text and public.labo_is_tester())
  with check (bucket_id = 'labo' and (storage.foldername(name))[1] = (select auth.uid())::text and public.labo_is_tester());
drop policy if exists "labo: effacer ses photos" on storage.objects;
create policy "labo: effacer ses photos" on storage.objects for delete to authenticated
  using (bucket_id = 'labo' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== Te mettre testeur (à faire une fois) =====
-- Remplace l'adresse ci-dessous par celle de ton compte CollecDex, puis exécute ces deux lignes (garde les apostrophes) :
-- insert into public.labo_testers (user_id) select id from auth.users where email = 'ADRESSE-DE-TON-COMPTE' on conflict do nothing;
-- select count(*) as testeurs from public.labo_testers;
