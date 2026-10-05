-- CollecDex v16 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v15.sql)
-- La liste de souhaits devient PERSONNELLE : plus d'échanges dans CollecDex (décision d'Arnaud, 5 oct. 2026).
--  (1) Les amis et les visiteurs d'une vitrine publique ne reçoivent plus la liste de souhaits (ni le réglage showWish).
--  (2) Ménage de l'ancienne notification « un ami a en double une carte que je recherche »
--      (seulement si l'ancienne version de supabase-v15.sql a été lancée ; sinon ces lignes ne font rien).
-- On peut relancer ce script sans risque.

-- ===== (1) Vitrine d'un ami : sans la liste de souhaits =====
create or replace function public.friend_showcase(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_user <> me and not are_friends(me, p_user::text) then raise exception 'Vous n''êtes pas (encore) amis'; end if;
  return json_build_object(
    'pseudo', (select pseudo from pseudos where user_id = p_user),
    'profile', coalesce((select profile - 'goals' - 'favSets' - 'wishlist' - 'showWish' from profiles where user_id = p_user), '{}'::jsonb),
    'items', coalesce((select json_agg(data) from items where user_id = p_user and not deleted and coalesce((data ->> 'qty')::int, 0) > 0), '[]'::json),
    'certs', coalesce((select json_agg(json_build_object('photo_id', photo_id, 'key', key)) from certifications where user_id = p_user), '[]'::json)
  );
end $$;
revoke all on function public.friend_showcase(uuid) from public, anon;
grant execute on function public.friend_showcase(uuid) to authenticated;

-- ===== (1) Vitrine publique : sans la liste de souhaits =====
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
    'profile', prof - 'goals' - 'favSets' - 'match' - 'pseudo' - 'wishlist' - 'showWish'
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

-- ===== (2) Ménage de la notification « carte recherchée » =====
drop trigger if exists wish_check on public.items;
drop function if exists public._wish_check();
drop function if exists public.push_due_wishes();
drop table if exists public.wish_alerts;
update public.push_subs set kinds = kinds - 'wish' where kinds ? 'wish';
