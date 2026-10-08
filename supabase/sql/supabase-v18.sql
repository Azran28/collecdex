-- CollecDex v18 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v17.sql)
-- Combats en ligne séparés par licence (Pokémon, One Piece…) :
--  • le salon garde sa licence (colonne « game ») : celui qui rejoint choisit son équipe dans la même licence ;
--  • la revanche garde la licence du combat.
--  • On peut relancer ce script sans risque.

alter table public.battle_rooms add column if not exists game text not null default 'pokemon';
alter table public.battle_rooms drop constraint if exists battle_rooms_game_check;
alter table public.battle_rooms add constraint battle_rooms_game_check check (game ~ '^[a-z]{2,20}$');

-- Licence du salon : posée par son créateur juste après la création (tant que personne n'est entré)
create or replace function public.battle_set_game(p_code text, p_game text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g text := lower(btrim(coalesce(p_game, '')));
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if g !~ '^[a-z]{2,20}$' then return json_build_object('ok', false, 'reason', 'Licence invalide'); end if;
  update battle_rooms set game = g, updated_at = now()
  where code = upper(btrim(coalesce(p_code, ''))) and host = me and status = 'waiting';
  if not found then return json_build_object('ok', false, 'reason', 'Salon introuvable'); end if;
  return json_build_object('ok', true);
end $$;
revoke all on function public.battle_set_game(text, text) from public, anon;
grant execute on function public.battle_set_game(text, text) to authenticated;

-- Regarder un salon avant d'y entrer (comme supabase-v10.sql) + sa licence
create or replace function public.battle_peek(p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, '')));
  if r.code is null or r.status <> 'waiting' then return json_build_object('ok', false, 'reason', 'Aucun salon en attente avec ce code'); end if;
  if r.host = me then return json_build_object('ok', false, 'reason', 'C''est ton propre salon : envoie le code à ton adversaire'); end if;
  return json_build_object('ok', true, 'mode', r.mode, 'game', r.game, 'host_pseudo', (select pseudo from pseudos where user_id = r.host));
end $$;
revoke all on function public.battle_peek(text) from public, anon;
grant execute on function public.battle_peek(text) to authenticated;

-- État du salon (comme supabase-v15.sql) + sa licence
create or replace function public.battle_state(p_code text, p_after int)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms; foe uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, '')));
  if r.code is null or me not in (r.host, coalesce(r.guest, r.host)) then return json_build_object('ok', false, 'reason', 'Salon introuvable (il a peut-être expiré)'); end if;
  foe := case when me = r.host then r.guest else r.host end;
  return json_build_object(
    'ok', true, 'code', r.code, 'status', r.status, 'mode', r.mode, 'game', r.game, 'seed', r.seed, 'winner', r.winner,
    'host', r.host, 'guest', r.guest, 'me_host', me = r.host,
    'host_pseudo', (select pseudo from pseudos where user_id = r.host),
    'guest_pseudo', (select pseudo from pseudos where user_id = r.guest),
    'host_ready', r.host_team is not null, 'guest_ready', r.guest_team is not null,
    'host_team', case when p_after < 0 and r.status in ('playing', 'done') then r.host_team end,
    'guest_team', case when p_after < 0 and r.status in ('playing', 'done') then r.guest_team end,
    'rematch', case when r.rematch is not null and exists (select 1 from battle_rooms b where b.code = r.rematch and b.status = 'lobby') then r.rematch end,
    'rematch_by', (select case when b.host = me then 'me' else 'foe' end from battle_rooms b where b.code = r.rematch and b.status = 'lobby'),
    'moves', coalesce((select json_agg(json_build_object('n', m.n, 'move', m.move) order by m.n)
                       from battle_moves m where m.code = r.code and m.by_user = foe and m.n > p_after), '[]'::json)
  );
end $$;
revoke all on function public.battle_state(text, int) from public, anon;
grant execute on function public.battle_state(text, int) to authenticated;

-- Revanche (comme supabase-v15.sql) : même adversaire, même mode, même licence
create or replace function public.battle_rematch(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms; foe uuid; c text; i int;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if r.code is null or r.guest is null or me not in (r.host, r.guest) then return json_build_object('ok', false, 'reason', 'Salon introuvable (il a peut-être expiré)'); end if;
  if r.status <> 'done' then return json_build_object('ok', false, 'reason', 'Le combat n''est pas terminé'); end if;
  foe := case when me = r.host then r.guest else r.host end;
  if public.is_blocked(me, foe) then return json_build_object('ok', false, 'reason', 'Revanche impossible'); end if;
  -- l'autre a déjà demandé la revanche : on rejoint son salon
  if r.rematch is not null and exists (select 1 from battle_rooms b where b.code = r.rematch and b.status = 'lobby') then
    return json_build_object('ok', true, 'code', r.rematch);
  end if;
  if r.rematch is not null then return json_build_object('ok', false, 'reason', 'Ton adversaire a quitté la revanche'); end if;
  if (select count(*) from battle_rooms where host = me and created_at > now() - interval '1 hour') >= 30 then
    return json_build_object('ok', false, 'reason', 'Trop de salons créés, réessaie dans un moment');
  end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from battle_rooms where code = c);
  end loop;
  insert into battle_rooms (code, host, guest, mode, game, seed, status)
  values (c, me, foe, r.mode, r.game, floor(random() * 2147483647)::int, 'lobby');
  update battle_rooms set rematch = c where code = r.code;
  return json_build_object('ok', true, 'code', c);
end $$;
revoke all on function public.battle_rematch(text) from public, anon;
grant execute on function public.battle_rematch(text) to authenticated;
