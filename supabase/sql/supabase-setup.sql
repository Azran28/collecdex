-- CollecDex : création de la base (à exécuter une seule fois dans Supabase → SQL Editor)
-- Chaque utilisateur ne peut lire et modifier QUE ses propres données (règles « row level security »).

-- 1) Cartes possédées : une ligne par carte
create table if not exists public.items (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  key        text    not null,
  data       jsonb   not null,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  primary key (user_id, key)
);
alter table public.items enable row level security;
drop policy if exists "items: chacun les siennes" on public.items;
create policy "items: chacun les siennes" on public.items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2) Vitrine + réglages : une ligne par utilisateur
create table if not exists public.profiles (
  user_id    uuid   primary key default auth.uid() references auth.users (id) on delete cascade,
  profile    jsonb  not null default '{}'::jsonb,
  settings   jsonb  not null default '{}'::jsonb,
  updated_at bigint not null default 0
);
alter table public.profiles enable row level security;
drop policy if exists "profiles: chacun le sien" on public.profiles;
create policy "profiles: chacun le sien" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Accès aux tables pour les utilisateurs connectés uniquement (les règles ci-dessus limitent chacun à ses données)
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- 3) Photos : espace privé « photos », un dossier par utilisateur (<id utilisateur>/<photo>.jpg)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos: lire les siennes" on storage.objects;
drop policy if exists "photos: ajouter les siennes" on storage.objects;
drop policy if exists "photos: modifier les siennes" on storage.objects;
drop policy if exists "photos: supprimer les siennes" on storage.objects;
create policy "photos: lire les siennes" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: ajouter les siennes" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: modifier les siennes" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos: supprimer les siennes" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
