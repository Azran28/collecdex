-- CollecDex v14 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v13.sql)
-- Bloquer et signaler un dresseur (exigé par Google Play dès qu'il y a des échanges entre utilisateurs).
--  • Bloquer : l'amitié (ou la demande) est supprimée des deux côtés ; il ne peut plus t'envoyer de demande
--    (elle est ignorée sans le lui dire), ni toi à lui, ni rejoindre ton salon de combat (et inversement).
--    Il ne voit plus ta vitrine d'ami ni tes photos (ce n'est plus un ami). Tu peux débloquer à tout moment.
--  • Signaler : enregistre le signalement avec une copie du pseudo et de la présentation au moment du
--    signalement (preuve, même s'il les change ensuite). 10 signalements par jour au plus, 1 par dresseur et par jour.
--  • Pour lire les signalements : Supabase → Table Editor → vue « reports_a_traiter » (ou table « reports »).
--    Pour bannir quelqu'un : Authentication → Users → son compte → Delete user (tout est effacé en cascade).

-- ===== Blocages =====
create table if not exists public.blocks (
  blocker    uuid not null references auth.users (id) on delete cascade,
  blocked    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked on public.blocks (blocked);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;   -- tout passe par les fonctions ci-dessous

-- x et y sont-ils bloqués (dans un sens ou dans l'autre) ?
create or replace function public.is_blocked(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x));
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

-- Une demande d'ami entre deux dresseurs bloqués est ignorée (sans message : le bloqué ne doit pas le savoir)
create or replace function public.friendships_block_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked(new.a, new.b) then return null; end if;
  return new;
end $$;
drop trigger if exists friendships_block_guard on public.friendships;
create trigger friendships_block_guard before insert on public.friendships
  for each row execute function public.friendships_block_guard();

-- Pas de combat en ligne entre deux dresseurs bloqués (même réponse qu'un code inconnu)
create or replace function public.battle_block_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.guest is not null and new.guest is distinct from old.guest and public.is_blocked(new.host, new.guest) then
    raise exception 'Aucun salon en attente avec ce code';
  end if;
  return new;
end $$;
drop trigger if exists battle_block_guard on public.battle_rooms;
create trigger battle_block_guard before update on public.battle_rooms
  for each row execute function public.battle_block_guard();

-- Bloquer un dresseur
create or replace function public.friend_block(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_user is null or p_user = me then return json_build_object('ok', false, 'reason', 'Dresseur invalide'); end if;
  if not exists (select 1 from auth.users where id = p_user) then return json_build_object('ok', false, 'reason', 'Dresseur introuvable'); end if;
  insert into blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from friendships where (a = me and b = p_user) or (a = p_user and b = me);
  -- salons en attente entre nous deux : fermés
  delete from battle_rooms where status in ('waiting', 'lobby') and ((host = me and guest = p_user) or (host = p_user and guest = me));
  return json_build_object('ok', true);
end $$;

-- Débloquer
create or replace function public.friend_unblock(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  delete from blocks where blocker = me and blocked = p_user;
  return json_build_object('ok', true);
end $$;

-- Mes dresseurs bloqués (avec leur pseudo, pour pouvoir les débloquer)
create or replace function public.friend_blocked()
returns table (user_id uuid, pseudo text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked, coalesce(p.pseudo, 'Dresseur'), b.created_at
  from blocks b left join pseudos p on p.user_id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc;
$$;

-- ===== Signalements =====
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  reporter   uuid not null references auth.users (id) on delete cascade,
  reported   uuid not null references auth.users (id) on delete cascade,
  reason     text not null check (reason in ('pseudo', 'vitrine', 'photos', 'harcelement', 'triche', 'autre')),
  details    text not null default '' check (char_length(details) <= 500),
  snapshot   jsonb not null default '{}'::jsonb,   -- pseudo et présentation au moment du signalement
  status     text not null default 'nouveau' check (status in ('nouveau', 'traite', 'rejete')),
  created_at timestamptz not null default now()
);
create index if not exists reports_reported on public.reports (reported);
create index if not exists reports_reporter on public.reports (reporter, created_at);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;   -- personne ne lit les signalements, sauf toi dans Supabase

create or replace function public.friend_report(p_user uuid, p_reason text, p_details text default '', p_block boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); snap jsonb;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_user is null or p_user = me then return json_build_object('ok', false, 'reason', 'Dresseur invalide'); end if;
  if not exists (select 1 from auth.users where id = p_user) then return json_build_object('ok', false, 'reason', 'Dresseur introuvable'); end if;
  if p_reason not in ('pseudo', 'vitrine', 'photos', 'harcelement', 'triche', 'autre') then
    return json_build_object('ok', false, 'reason', 'Choisis une raison');
  end if;
  if not exists (select 1 from reports where reporter = me and reported = p_user and created_at > now() - interval '1 day') then
    if (select count(*) from reports where reporter = me and created_at > now() - interval '1 day') >= 10 then
      return json_build_object('ok', false, 'reason', 'Trop de signalements aujourd''hui, réessaie demain');
    end if;
    select jsonb_build_object(
      'pseudo', (select pseudo from pseudos where user_id = p_user),
      'bio', (select left(profile ->> 'bio', 1000) from profiles where user_id = p_user),
      'avatar', (select profile -> 'avatarPoke' from profiles where user_id = p_user),
      'public', (select profile -> 'public' from profiles where user_id = p_user)
    ) into snap;
    insert into reports (reporter, reported, reason, details, snapshot)
    values (me, p_user, p_reason, left(btrim(coalesce(p_details, '')), 500), coalesce(snap, '{}'::jsonb));
  end if;
  if p_block then perform public.friend_block(p_user); end if;
  return json_build_object('ok', true);
end $$;

-- Vue pour lire les signalements dans Supabase (Table Editor) : les plus récents d'abord, avec les pseudos
create or replace view public.reports_a_traiter as
  select r.id, r.created_at, r.status, r.reason, r.details,
         coalesce(pr.pseudo, '?') as signale_par, coalesce(pd.pseudo, r.snapshot ->> 'pseudo', '?') as dresseur_signale,
         r.snapshot ->> 'bio' as presentation, r.reported as id_signale,
         (select count(*) from reports r2 where r2.reported = r.reported) as nb_signalements
  from reports r
  left join pseudos pr on pr.user_id = r.reporter
  left join pseudos pd on pd.user_id = r.reported
  order by r.created_at desc;
revoke all on public.reports_a_traiter from anon, authenticated;

revoke all on function public.friend_block(uuid) from public, anon;
revoke all on function public.friend_unblock(uuid) from public, anon;
revoke all on function public.friend_blocked() from public, anon;
revoke all on function public.friend_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.friend_block(uuid) to authenticated;
grant execute on function public.friend_unblock(uuid) to authenticated;
grant execute on function public.friend_blocked() to authenticated;
grant execute on function public.friend_report(uuid, text, text, boolean) to authenticated;
