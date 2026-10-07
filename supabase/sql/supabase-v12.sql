-- CollecDex v12 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v11.sql)
-- Combat en ligne : on choisit son équipe APRÈS être entré dans le salon.
--  • Créer un salon ne demande plus d'équipe ; quand l'adversaire entre avec le code, le salon passe en « lobby » :
--    chacun choisit alors son équipe ; le combat commence quand les deux sont prêts.
--  • On ne voit pas l'équipe de l'autre avant d'avoir envoyé la sienne (pas de contre-choix).
--  • Quitter pendant le choix ferme le salon (ni victoire ni défaite).
--  • Les anciennes versions de l'appli (qui envoient l'équipe tout de suite) marchent encore.
--  • On peut relancer ce script sans risque.

alter table public.battle_rooms alter column host_team drop not null;
alter table public.battle_rooms drop constraint if exists battle_rooms_status_check;
alter table public.battle_rooms add constraint battle_rooms_status_check check (status in ('waiting', 'lobby', 'playing', 'done'));

-- Créer un salon (équipe facultative : elle sera choisie une fois l'adversaire arrivé)
create or replace function public.battle_create(p_mode text, p_team jsonb default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; i int;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_team is not null and (jsonb_typeof(p_team) <> 'object' or pg_column_size(p_team) > 60000) then
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

-- Rejoindre un salon avec son code (équipe facultative : choisie ensuite avec battle_team)
create or replace function public.battle_join(p_code text, p_team jsonb default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_team is not null and (jsonb_typeof(p_team) <> 'object' or pg_column_size(p_team) > 60000) then
    return json_build_object('ok', false, 'reason', 'Équipe invalide');
  end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if r.code is null or r.status <> 'waiting' or r.guest is not null then return json_build_object('ok', false, 'reason', 'Aucun salon en attente avec ce code'); end if;
  if r.host = me then return json_build_object('ok', false, 'reason', 'C''est ton propre salon : envoie le code à ton adversaire'); end if;
  update battle_rooms set guest = me, guest_team = p_team, updated_at = now(),
    status = case when r.host_team is not null and p_team is not null then 'playing' else 'lobby' end
  where code = r.code;
  return json_build_object('ok', true, 'code', r.code);
end $$;

-- Envoyer mon équipe une fois dans le salon ; le combat commence quand les deux équipes sont là
create or replace function public.battle_team(p_code text, p_team jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r battle_rooms;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_team is null or jsonb_typeof(p_team) <> 'object' or pg_column_size(p_team) > 60000 then
    return json_build_object('ok', false, 'reason', 'Équipe invalide');
  end if;
  select * into r from battle_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if r.code is null or me not in (r.host, coalesce(r.guest, r.host)) then return json_build_object('ok', false, 'reason', 'Salon introuvable (il a peut-être expiré)'); end if;
  if r.status <> 'lobby' then return json_build_object('ok', false, 'reason', 'Le salon a été fermé'); end if;
  if me = r.host then r.host_team := p_team; else r.guest_team := p_team; end if;
  update battle_rooms set host_team = r.host_team, guest_team = r.guest_team, updated_at = now(),
    status = case when r.host_team is not null and r.guest_team is not null then 'playing' else 'lobby' end
  where code = r.code;
  return json_build_object('ok', true);
end $$;

-- État du salon : les équipes ne sont données qu'une fois le combat lancé (pas pendant le choix)
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
    'host_ready', r.host_team is not null, 'guest_ready', r.guest_team is not null,
    'host_team', case when p_after < 0 and r.status in ('playing', 'done') then r.host_team end,
    'guest_team', case when p_after < 0 and r.status in ('playing', 'done') then r.guest_team end,
    'moves', coalesce((select json_agg(json_build_object('n', m.n, 'move', m.move) order by m.n)
                       from battle_moves m where m.code = r.code and m.by_user = foe and m.n > p_after), '[]'::json)
  );
end $$;

-- Jouer un coup ; « quit » pendant le choix des équipes ferme le salon sans vainqueur
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
  if r.status = 'lobby' and k = 'quit' then
    update battle_rooms set status = 'done', winner = null, updated_at = now() where code = r.code;
    return json_build_object('ok', true);
  end if;
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
revoke all on function public.battle_join(text, jsonb) from public, anon;
revoke all on function public.battle_team(text, jsonb) from public, anon;
revoke all on function public.battle_state(text, int) from public, anon;
revoke all on function public.battle_move(text, int, jsonb) from public, anon;
grant execute on function public.battle_create(text, jsonb) to authenticated;
grant execute on function public.battle_join(text, jsonb) to authenticated;
grant execute on function public.battle_team(text, jsonb) to authenticated;
grant execute on function public.battle_state(text, int) to authenticated;
grant execute on function public.battle_move(text, int, jsonb) to authenticated;
