-- CollecDex v9 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v8.sql)
-- Vitrine publique partageable : un dresseur peut rendre sa vitrine visible par TOUT LE MONDE
-- (même sans compte), à l'adresse …/collecdex/#/@Pseudo.
--  • C'est lui qui l'active (case « Vitrine publique » dans Personnaliser ma vitrine → profile.public = true).
--  • Seulement avec un pseudo réservé ; même réponse « introuvable » si le pseudo n'existe pas ou si la vitrine est privée.
--  • On n'envoie que ce que la vitrine montre : jamais les notes perso, ni les objectifs, ni la liste des séries suivies.
--  • Photos : seulement les photos choisies comme visuel d'une carte (displayPhoto) et la photo d'avatar,
--    et seulement si le dresseur a gardé « Montrer mes photos » (profile.publicPhotos ≠ false).

-- La vitrine publique d'un dresseur, par son pseudo
create or replace function public.public_showcase(p_pseudo text)
returns json language plpgsql stable security definer set search_path = public as $$
declare uid uuid; pname text; prof jsonb;
begin
  select ps.user_id, ps.pseudo into uid, pname from pseudos ps where lower(ps.pseudo) = lower(btrim(coalesce(p_pseudo, '')));
  if uid is not null then select pr.profile into prof from profiles pr where pr.user_id = uid; end if;
  if uid is null or prof is null or coalesce(prof ->> 'public', '') <> 'true' then
    return json_build_object('ok', false, 'reason', 'Cette vitrine n''existe pas ou n''est pas publique');
  end if;
  return json_build_object(
    'ok', true,
    'user_id', uid,
    'pseudo', pname,
    'photos', coalesce(prof ->> 'publicPhotos', '') <> 'false',
    'profile', prof - 'goals' - 'favSets' - 'match' - 'pseudo'
               - (case when coalesce(prof ->> 'showWish', '') = 'false' then 'wishlist' else '' end)
               - (case when coalesce(prof ->> 'publicPhotos', '') = 'false' then 'avatar' else '' end),
    'items', coalesce((select json_agg(
               i.data - 'note' - 'certNote' - 'rating' - 'photoSrc'
               - (case when coalesce(prof ->> 'publicPhotos', '') = 'false' then 'displayPhoto' else '' end))
             from items i where i.user_id = uid and not i.deleted and coalesce((i.data ->> 'qty')::int, 0) > 0), '[]'::json),
    'certs', coalesce((select json_agg(json_build_object('photo_id', c.photo_id, 'key', c.key)) from certifications c where c.user_id = uid), '[]'::json)
  );
end $$;
revoke all on function public.public_showcase(text) from public;
grant execute on function public.public_showcase(text) to anon, authenticated;

-- Cette photo fait-elle partie d'une vitrine publique ? (chemin « <uid>/<photo>.jpg »)
create or replace function public.photo_is_public(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles pr
    where pr.user_id::text = split_part(p_name, '/', 1)
      and coalesce(pr.profile ->> 'public', '') = 'true'
      and coalesce(pr.profile ->> 'publicPhotos', '') <> 'false'
      and exists (select 1 from pseudos ps where ps.user_id = pr.user_id)
      and (
        pr.profile ->> 'avatar' || '.jpg' = split_part(p_name, '/', 2)
        or exists (select 1 from items i where i.user_id = pr.user_id and not i.deleted
                   and coalesce((i.data ->> 'qty')::int, 0) > 0
                   and i.data ->> 'displayPhoto' || '.jpg' = split_part(p_name, '/', 2))
      )
  );
$$;
revoke all on function public.photo_is_public(text) from public;
grant execute on function public.photo_is_public(text) to anon, authenticated;

drop policy if exists "photos: lire celles des vitrines publiques" on storage.objects;
create policy "photos: lire celles des vitrines publiques" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos' and public.photo_is_public(name));
