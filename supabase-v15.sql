-- CollecDex v15 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v14.sql)
-- Deux choses : (1) notification « carte recherchée proposée », (2) revanche en un geste après un combat en ligne (plus bas).
-- (1) Notification « Une carte que tu recherches est proposée » :
--  quand un de tes amis a en DOUBLE (2 exemplaires ou plus) une carte de ta liste de souhaits,
--  ton téléphone est prévenu (il peut te la proposer en échange).
--  • Envoyée par la même fonction que les capsules (« hyper-processor ») : à remettre à jour avec le nouveau code
--    (supabase/functions/capsule-notify/index.ts) dans Edge Functions.
--  • Une seule notification par carte et par ami (jamais deux fois la même).
--  • Pas d'alerte si tu as déjà la carte, ni entre dresseurs qui se sont bloqués.
--  • Chaque appareil peut la couper (Paramètres › Notifications › « Un ami a en double une carte que je recherche »).
--  • On peut relancer ce script sans risque.

-- Alertes à envoyer (une ligne par carte, ami qui l'a en double, dresseur qui la recherche)
create table if not exists public.wish_alerts (
  wisher     uuid not null references auth.users (id) on delete cascade,  -- celui qui recherche la carte
  owner      uuid not null references auth.users (id) on delete cascade,  -- l'ami qui l'a en double
  key        text not null,                                              -- « jeu:id » de la carte
  name       text not null default '',
  notified   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (wisher, owner, key)
);
alter table public.wish_alerts enable row level security;
revoke all on public.wish_alerts from anon, authenticated;
grant select, update on public.wish_alerts to service_role;

-- À chaque carte enregistrée : si elle passe à 2 exemplaires ou plus, on cherche les amis qui la recherchent
create or replace function public._wish_check()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  q int; q0 int := 0; g text; cid text; n int := 0;
begin
  if new.deleted then return new; end if;
  q := coalesce((new.data ->> 'qty')::int, 0);
  if tg_op = 'UPDATE' and not old.deleted then q0 := coalesce((old.data ->> 'qty')::int, 0); end if;
  if q < 2 or q0 >= 2 then return new; end if;
  g := new.data ->> 'game'; cid := new.data ->> 'id';
  if g is null or cid is null then return new; end if;

  insert into wish_alerts (wisher, owner, key, name)
  select fr.uid, new.user_id, g || ':' || cid, left(coalesce(new.data -> 'snap' ->> 'name', ''), 60)
  from (
    select case when f.a = new.user_id then f.b else f.a end as uid
    from friendships f
    where f.status = 'accepted' and new.user_id in (f.a, f.b)
  ) fr
  join profiles p on p.user_id = fr.uid
  where p.profile -> 'wishlist' @> jsonb_build_array(jsonb_build_object('game', g, 'id', cid))
    -- il ne l'a pas déjà
    and not exists (select 1 from items i where i.user_id = fr.uid and i.key = g || ':' || cid
                    and not i.deleted and coalesce((i.data ->> 'qty')::int, 0) > 0)
    -- pas de blocage d'un côté ou de l'autre
    and not exists (select 1 from blocks b where (b.blocker = fr.uid and b.blocked = new.user_id)
                                              or (b.blocker = new.user_id and b.blocked = fr.uid))
  on conflict do nothing;
  get diagnostics n = row_count;

  if n > 0 then
    begin
      perform net.http_post(
        url := 'https://zjzfwhtqrigfmqzfebzy.supabase.co/functions/v1/hyper-processor',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb);
    exception when others then null; -- la notification partira au passage suivant (5 minutes)
    end;
  end if;
  return new;
exception when others then
  return new; -- une alerte ratée ne doit jamais empêcher d'enregistrer une carte
end $$;
revoke all on function public._wish_check() from public, anon, authenticated;
drop trigger if exists wish_check on public.items;
create trigger wish_check after insert or update on public.items
  for each row execute function public._wish_check();

-- Appareils à prévenir maintenant ; utilisée seulement par la fonction d'envoi
create or replace function public.push_due_wishes()
returns table (endpoint text, p256dh text, auth text, pseudo text, card text, owner uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record;
begin
  for r in
    select w.wisher, w.owner, w.key, w.name, w.created_at, coalesce(ps.pseudo, 'Un ami') as who from wish_alerts w
    left join pseudos ps on ps.user_id = w.owner
    where not w.notified
    for update of w skip locked
  loop
    update wish_alerts set notified = true where wisher = r.wisher and owner = r.owner and key = r.key;
    if r.created_at > now() - interval '2 days' then
      return query select p.endpoint, p.p256dh, p.auth, r.who, r.name, r.owner from push_subs p
        where p.user_id = r.wisher and coalesce((p.kinds ->> 'wish')::boolean, true);
    end if;
  end loop;
end $$;
revoke all on function public.push_due_wishes() from public, anon, authenticated;
grant execute on function public.push_due_wishes() to service_role;

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
