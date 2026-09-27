-- CollecDex v6 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v5.sql)
-- Renforcement de la sécurité (aucun changement visible sur le site) :
--  1) la liste des pseudos n'est plus lisible en entier : chacun ne lit que le sien
--     (on trouve un ami par son pseudo exact via friend_request, sans voir les autres) ;
--  2) une demande d'ami en attente ne montre plus le nombre de cartes de l'autre (seulement entre amis) ;
--  3) taille maximale des données envoyées par chaque dresseur (protège la base gratuite contre les abus).

-- ===== 1) Pseudos : chacun lit seulement le sien =====
drop policy if exists "pseudos: lisibles par les connectés" on public.pseudos;
drop policy if exists "pseudos: lire le sien" on public.pseudos;
create policy "pseudos: lire le sien" on public.pseudos for select to authenticated
  using ((select auth.uid()) = user_id);

-- ===== 2) Liste d'amis : nombre de cartes seulement pour les amis acceptés =====
create or replace function public.friend_list()
returns table (user_id uuid, pseudo text, avatar jsonb, status text, incoming boolean, since timestamptz, cards int)
language sql stable security definer set search_path = public as $$
  select o.other, coalesce(ps.pseudo, 'Dresseur'), pr.profile -> 'avatarPoke', f.status,
         (f.b = auth.uid() and f.status = 'pending'), f.created_at,
         case when f.status = 'accepted' then
           (select count(*)::int from items i where i.user_id = o.other and not i.deleted and coalesce((i.data ->> 'qty')::int, 0) > 0)
         else 0 end
  from friendships f
  cross join lateral (select case when f.a = auth.uid() then f.b else f.a end as other) o
  left join pseudos ps on ps.user_id = o.other
  left join profiles pr on pr.user_id = o.other
  where auth.uid() in (f.a, f.b)
  order by f.status desc, ps.pseudo;
$$;
revoke all on function public.friend_list() from public, anon;
grant execute on function public.friend_list() to authenticated;

-- Les autres fonctions des amis : réservées aux dresseurs connectés
revoke all on function public.friend_request(text) from public, anon;
revoke all on function public.friend_respond(uuid, boolean) from public, anon;
revoke all on function public.friend_remove(uuid) from public, anon;
revoke all on function public.friend_showcase(uuid) from public, anon;
grant execute on function public.friend_request(text) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friend_showcase(uuid) to authenticated;

-- ===== 3) Taille maximale des données (largement au-dessus d'un usage normal) =====
-- une carte : 100 Ko maximum (une carte normale fait environ 1 Ko)
alter table public.items drop constraint if exists items_data_size;
alter table public.items add constraint items_data_size check (pg_column_size(data) <= 102400) not valid;
alter table public.items drop constraint if exists items_key_size;
alter table public.items add constraint items_key_size check (char_length(key) <= 200) not valid;
-- vitrine + réglages : 1 Mo maximum
alter table public.profiles drop constraint if exists profiles_size;
alter table public.profiles add constraint profiles_size check (pg_column_size(profile) + pg_column_size(settings) <= 1048576) not valid;
