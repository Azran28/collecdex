-- CollecDex v10 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v9.sql)
-- Combat en ligne : l'un crée un salon (code de 6 caractères), l'autre le rejoint avec le code.
--  • N'importe quel dresseur connecté (avec un compte) peut rejoindre avec le code, même s'ils ne sont pas amis.
--  • Déjà exécuté avant ? Pas de souci : on peut le relancer (les tables sont gardées, les fonctions remplacées).
--  • Qui commence : tiré à pile ou face à partir de « seed » (même résultat sur les deux téléphones).
--  • Le serveur garde les équipes et la liste des coups ; chaque téléphone rejoue les mêmes coups dans le même ordre
--    (même tirage des pièces grâce à « seed »), donc les deux voient exactement le même combat.
--  • Les salons de plus d'un jour sont effacés tout seuls (à chaque création de salon).

create table if not exists public.battle_rooms (
  code       text primary key,
  host       uuid not null references auth.users (id) on delete cascade,
  guest      uuid references auth.users (id) on delete cascade,
  mode       text not null default 'classic' check (mode in ('classic', 'adv')),
  seed       int  not null,
  host_team  jsonb not null,
  guest_team jsonb,
  status     text not null default 'waiting' check (status in ('waiting', 'playing', 'done')),
  winner     uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists battle_rooms_host on public.battle_rooms (host);
create table if not exists public.battle_moves (
  code       text not null references public.battle_rooms (code) on delete cascade,
  by_user    uuid not null,
  n          int  not null,           -- numéro du coup de ce joueur (1, 2, 3…) : renvoyer le même coup ne le double pas
  move       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (code, by_user, n)
);
-- personne ne lit ni n'écrit ces tables directement : tout passe par les fonctions ci-dessous
alter table public.battle_rooms enable row level security;
alter table public.battle_moves enable row level security;
revoke all on public.battle_rooms from anon, authenticated;
revoke all on public.battle_moves from anon, authenticated;

-- Créer un salon (mon ancien salon en attente est remplacé)
create or replace function public.battle_create(p_mode text, p_team jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; i int;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_team is null or jsonb_typeof(p_team) <> 'object' or pg_column_size(p_team) > 60000 then
    return json_build_object('ok', false, 'reason', 'Équipe invalide');
  end if;
  delete from battle_rooms where created_at < now() - interval '1 day';
  delete from battle_rooms where host = me and status = 'waiting';
  if (select count(*) from battle_rooms where host = me and created_at > now() - interval '1 hour') >= 30 then
    return json_build_object('ok', false, 'reason', 'Trop de salons créés, réessaie dans un moment');
  end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from battle_rooms where code = c);
  end loop;
  insert into battle_rooms (code, host, mode, seed, host_team)
  values (c, me, case when p_mode = 'adv' then 'adv' else 'classic' end, floor(random() * 2147483647)::int, p_team);
  return json_build_object('ok', true, 'code', c);
end $$;

-- Mode du salon (pour que l'invité prépare la bonne équipe avant de rejoindre)
create or replace function public.battle_peek(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, '')));
  if r.code is null or r.status <> 'waiting' then return json_build_object('ok', false, 'reason', 'Aucun salon en attente avec ce code'); end if;
  if r.host = me then return json_build_object('ok', false, 'reason', 'C''est ton propre salon : envoie le code à ton adversaire'); end if;
  return json_build_object('ok', true, 'mode', r.mode, 'host_pseudo', (select pseudo from pseudos where user_id = r.host));
end $$;

-- Rejoindre un salon avec son code
create or replace function public.battle_join(p_code text, p_team jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_team is null or jsonb_typeof(p_team) <> 'object' or pg_column_size(p_team) > 60000 then
    return json_build_object('ok', false, 'reason', 'Équipe invalide');
  end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if r.code is null or r.status <> 'waiting' or r.guest is not null then return json_build_object('ok', false, 'reason', 'Aucun salon en attente avec ce code'); end if;
  if r.host = me then return json_build_object('ok', false, 'reason', 'C''est ton propre salon : envoie le code à ton adversaire'); end if;
  update battle_rooms set guest = me, guest_team = p_team, status = 'playing', updated_at = now() where code = r.code;
  return json_build_object('ok', true, 'code', r.code);
end $$;

-- État du salon + coups de l'adversaire après le n° p_after (p_after < 0 : avec les équipes)
create or replace function public.battle_state(p_code text, p_after int)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms; foe uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, '')));
  if r.code is null or me not in (r.host, coalesce(r.guest, r.host)) then return json_build_object('ok', false, 'reason', 'Salon introuvable (il a peut-être expiré)'); end if;
  foe := case when me = r.host then r.guest else r.host end;
  return json_build_object(
    'ok', true, 'code', r.code, 'status', r.status, 'mode', r.mode, 'seed', r.seed, 'winner', r.winner,
    'host', r.host, 'guest', r.guest, 'me_host', me = r.host,
    'host_pseudo', (select pseudo from pseudos where user_id = r.host),
    'guest_pseudo', (select pseudo from pseudos where user_id = r.guest),
    'host_team', case when p_after < 0 then r.host_team end,
    'guest_team', case when p_after < 0 then r.guest_team end,
    'moves', coalesce((select json_agg(json_build_object('n', m.n, 'move', m.move) order by m.n)
                       from battle_moves m where m.code = r.code and m.by_user = foe and m.n > p_after), '[]'::json)
  );
end $$;

-- Jouer un coup (n = numéro de mon coup ; un coup déjà reçu est ignoré)
create or replace function public.battle_move(p_code text, p_n int, p_move jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms; k text := p_move ->> 'kind';
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_move is null or jsonb_typeof(p_move) <> 'object' or pg_column_size(p_move) > 2000 or p_n < 1 or p_n > 5000 then
    return json_build_object('ok', false, 'reason', 'Coup invalide');
  end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if r.code is null or me not in (r.host, coalesce(r.guest, r.host)) then return json_build_object('ok', false, 'reason', 'Salon introuvable'); end if;
  if r.status = 'waiting' and k = 'quit' and me = r.host then delete from battle_rooms where code = r.code; return json_build_object('ok', true); end if;
  if r.status <> 'playing' then return json_build_object('ok', true, 'done', true); end if;
  insert into battle_moves (code, by_user, n, move) values (r.code, me, p_n, p_move) on conflict do nothing;
  if k in ('quit', 'over') then
    update battle_rooms set status = 'done', updated_at = now(),
      winner = case when k = 'quit' then (case when me = r.host then r.guest else r.host end)
                    when (p_move ->> 'win') = 'true' then me else (case when me = r.host then r.guest else r.host end) end
    where code = r.code;
  else
    update battle_rooms set updated_at = now() where code = r.code;
  end if;
  return json_build_object('ok', true);
end $$;

revoke all on function public.battle_create(text, jsonb) from public, anon;
revoke all on function public.battle_peek(text) from public, anon;
revoke all on function public.battle_join(text, jsonb) from public, anon;
revoke all on function public.battle_state(text, int) from public, anon;
revoke all on function public.battle_move(text, int, jsonb) from public, anon;
grant execute on function public.battle_create(text, jsonb) to authenticated;
grant execute on function public.battle_peek(text) to authenticated;
grant execute on function public.battle_join(text, jsonb) to authenticated;
grant execute on function public.battle_state(text, int) to authenticated;
grant execute on function public.battle_move(text, int, jsonb) to authenticated;
