-- CollecDex v4 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v3.sql)
-- Amis : s'ajouter par pseudo, accepter / refuser, et voir la vitrine (et les photos) de ses amis.
-- Tout passe par des fonctions du serveur : personne ne peut lire la collection d'un inconnu.

-- ===== Amitiés =====
create table if not exists public.friendships (
  a uuid not null references auth.users (id) on delete cascade,   -- celui qui demande
  b uuid not null references auth.users (id) on delete cascade,   -- celui qui reçoit la demande
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
create index if not exists friendships_b on public.friendships (b);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;
drop policy if exists "amis: les miennes" on public.friendships;
create policy "amis: les miennes" on public.friendships for select to authenticated
  using ((select auth.uid()) in (a, b));

-- Sont-ils amis ? (y en texte : sert aussi pour les dossiers de photos)
create or replace function public.are_friends(x uuid, y text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'accepted'
    and ((f.a = x and f.b::text = y) or (f.b = x and f.a::text = y)));
$$;
revoke all on function public.are_friends(uuid, text) from public, anon;
grant execute on function public.are_friends(uuid, text) to authenticated;

-- Demande d'ami par pseudo (si l'autre m'avait déjà demandé : on devient amis tout de suite)
create or replace function public.friend_request(p_pseudo text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); target uuid; tname text;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select user_id, pseudo into target, tname from pseudos where lower(pseudo) = lower(trim(p_pseudo));
  if target is null then return json_build_object('ok', false, 'reason', 'Aucun dresseur avec ce pseudo'); end if;
  if target = me then return json_build_object('ok', false, 'reason', 'C''est ton propre pseudo !'); end if;
  if exists (select 1 from friendships where status = 'accepted' and ((a = me and b = target) or (a = target and b = me))) then
    return json_build_object('ok', true, 'state', 'amis', 'pseudo', tname);
  end if;
  if exists (select 1 from friendships where a = target and b = me) then
    update friendships set status = 'accepted' where a = target and b = me;
    return json_build_object('ok', true, 'state', 'amis', 'pseudo', tname);
  end if;
  if exists (select 1 from friendships where a = me and b = target) then
    return json_build_object('ok', true, 'state', 'envoyee', 'pseudo', tname);
  end if;
  if (select count(*) from friendships where a = me and status = 'pending' and created_at > now() - interval '1 day') >= 30 then
    return json_build_object('ok', false, 'reason', 'Trop de demandes aujourd''hui, réessaie demain');
  end if;
  insert into friendships (a, b) values (me, target);
  return json_build_object('ok', true, 'state', 'envoyee', 'pseudo', tname);
end $$;

-- Accepter ou refuser une demande reçue
create or replace function public.friend_respond(p_user uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_accept then update friendships set status = 'accepted' where a = p_user and b = me and status = 'pending';
  else delete from friendships where a = p_user and b = me and status = 'pending'; end if;
  return json_build_object('ok', true);
end $$;

-- Retirer un ami (ou annuler une demande envoyée)
create or replace function public.friend_remove(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  delete from friendships where (a = me and b = p_user) or (a = p_user and b = me);
  return json_build_object('ok', true);
end $$;

-- Mes amis et mes demandes (reçues / envoyées), avec pseudo, avatar et nombre de cartes
create or replace function public.friend_list()
returns table (user_id uuid, pseudo text, avatar jsonb, status text, incoming boolean, since timestamptz, cards int)
language sql stable security definer set search_path = public as $$
  select o.other, coalesce(ps.pseudo, 'Dresseur'), pr.profile -> 'avatarPoke', f.status,
         (f.b = auth.uid() and f.status = 'pending'), f.created_at,
         (select count(*)::int from items i where i.user_id = o.other and not i.deleted and coalesce((i.data ->> 'qty')::int, 0) > 0)
  from friendships f
  cross join lateral (select case when f.a = auth.uid() then f.b else f.a end as other) o
  left join pseudos ps on ps.user_id = o.other
  left join profiles pr on pr.user_id = o.other
  where auth.uid() in (f.a, f.b)
  order by f.status desc, ps.pseudo;
$$;

-- La vitrine d'un ami (lecture seule) : son profil, ses cartes et ses cartes certifiées
create or replace function public.friend_showcase(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_user <> me and not are_friends(me, p_user::text) then raise exception 'Vous n''êtes pas (encore) amis'; end if;
  return json_build_object(
    'pseudo', (select pseudo from pseudos where user_id = p_user),
    'profile', coalesce((select profile - 'goals' - 'favSets' from profiles where user_id = p_user), '{}'::jsonb),
    'items', coalesce((select json_agg(data) from items where user_id = p_user and not deleted and coalesce((data ->> 'qty')::int, 0) > 0), '[]'::json),
    'certs', coalesce((select json_agg(json_build_object('photo_id', photo_id, 'key', key)) from certifications where user_id = p_user), '[]'::json)
  );
end $$;

grant execute on function public.friend_request(text) to authenticated;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;
grant execute on function public.friend_remove(uuid) to authenticated;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.friend_showcase(uuid) to authenticated;

-- Photos : on peut aussi voir celles de ses amis (lecture seule)
drop policy if exists "photos: lire celles de mes amis" on storage.objects;
create policy "photos: lire celles de mes amis" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.are_friends((select auth.uid()), (storage.foldername(name))[1]));
