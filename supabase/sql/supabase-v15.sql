-- CollecDex v15 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v14.sql)
-- Revanche en un geste après un combat en ligne.
-- (La notification « carte recherchée proposée » de la v2.80 a été retirée en v2.82 : pas d'échanges dans CollecDex.
--  Si cette ancienne version du script a déjà été lancée, supabase-v16.sql fait le ménage.)
-- On peut relancer ce script sans risque.

-- ===================================================================================
-- Combat en ligne : REVANCHE en un geste.
--  À la fin d'un combat, « Revanche » crée un nouveau salon avec le même adversaire et le même mode
--  (directement au choix des équipes) ; l'autre voit « … propose une revanche » et la même touche le fait entrer.
-- ===================================================================================
alter table public.battle_rooms add column if not exists rematch text;

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
  insert into battle_rooms (code, host, guest, mode, seed, status)
  values (c, me, foe, r.mode, floor(random() * 2147483647)::int, 'lobby');
  update battle_rooms set rematch = c where code = r.code;
  return json_build_object('ok', true, 'code', c);
end $$;
revoke all on function public.battle_rematch(text) from public, anon;
grant execute on function public.battle_rematch(text) to authenticated;

-- État du salon (comme supabase-v12.sql) + « rematch » : salon de revanche proposé, s'il est encore ouvert
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
    'rematch', case when r.rematch is not null and exists (select 1 from battle_rooms b where b.code = r.rematch and b.status = 'lobby') then r.rematch end,
    'rematch_by', (select case when b.host = me then 'me' else 'foe' end from battle_rooms b where b.code = r.rematch and b.status = 'lobby'),
    'moves', coalesce((select json_agg(json_build_object('n', m.n, 'move', m.move) order by m.n)
                       from battle_moves m where m.code = r.code and m.by_user = foe and m.n > p_after), '[]'::json)
  );
end $$;
revoke all on function public.battle_state(text, int) from public, anon;
grant execute on function public.battle_state(text, int) to authenticated;
