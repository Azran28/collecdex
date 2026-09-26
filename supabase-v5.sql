-- CollecDex v5 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v4.sql)
-- Boutique des capsules : on vend ses Pokémon contre des éclats (la monnaie du site), et on achète des capsules (ou des grandes capsules).
-- Tout se passe ici, sur le serveur : impossible de se donner des éclats depuis le téléphone.

-- ===== Porte-monnaie et capsules achetées =====
alter table public.capsule_state add column if not exists coins int not null default 0;  -- éclats (la monnaie)
alter table public.capsule_state add column if not exists bonus int not null default 0;  -- capsules achetées (hors limite des 10)
alter table public.capsule_state add column if not exists big int not null default 0;    -- grandes capsules

-- Historique des ventes et achats (lecture seule pour le dresseur)
create table if not exists public.capsule_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,               -- 'vente' | 'achat'
  what text not null,               -- espèce vendue, ou 'capsule' / 'grande'
  n int not null,
  coins int not null,               -- + gagnés / − dépensés
  at timestamptz not null default now()
);
create index if not exists capsule_log_user on public.capsule_log (user_id, at desc);
alter table public.capsule_log enable row level security;
drop policy if exists "boutique: lecture perso" on public.capsule_log;
create policy "boutique: lecture perso" on public.capsule_log for select using (auth.uid() = user_id);

-- Prix de vente : commun 1, peu commun 3, rare 8, très rare 20, légendaire 100, fabuleux 150 ; chromatique ×5
create or replace function public.capsule_price(t smallint, sh boolean)
returns int language sql immutable as $$
  select (array[1, 3, 8, 20, 100, 150])[t] * case when sh then 5 else 1 end;
$$;

-- État complet (réserve gratuite + capsules achetées + éclats)
create or replace function public._capsule_json(s public.capsule_state)
returns json language sql stable as $$
  select json_build_object('stock', s.stock, 'max', 10, 'now', now(),
    'next_at', case when s.stock >= 10 then null else s.last_tick + interval '1 hour' end,
    'coins', s.coins, 'bonus', s.bonus, 'big', s.big,
    'prices', json_build_object('capsule', 20, 'grande', 150));
$$;

create or replace function public.capsule_status()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  perform _capsule_refill(me);
  select * into s from capsule_state where user_id = me;
  return _capsule_json(s);
end $$;

-- Ouvre une capsule : p_kind = 'normal' (réserve gratuite d'abord, puis capsules achetées) ou 'grande'.
-- Capsule : commun 50 %, peu commun 28 %, rare 15 %, très rare 4,5 %, légendaire 2 %, fabuleux 0,5 % ; chromatique 1 %.
-- Grande capsule : jamais de commun ni de peu commun — rare 45 %, très rare 33 %, légendaire 17 %, fabuleux 5 % ; chromatique 3 %.
drop function if exists public.capsule_open();
create or replace function public.capsule_open(p_kind text default 'normal')
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; r float8 := random(); t smallint; sp int; sh boolean; before int; cid bigint; nxt timestamptz; src text;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  s := _capsule_refill(me);
  if p_kind = 'grande' then
    if s.big < 1 then raise exception 'Tu n''as pas de grande capsule : achète-en une dans la boutique'; end if;
    t := case when r < 0.05 then 6 when r < 0.22 then 5 when r < 0.55 then 4 else 3 end;
    sh := random() < 0.03; src := 'grande';
  else
    if s.stock < 1 and s.bonus < 1 then raise exception 'Plus de capsule pour l''instant : la prochaine arrive bientôt (ou achète-en une dans la boutique)'; end if;
    t := case when r < 0.005 then 6 when r < 0.025 then 5 when r < 0.07 then 4 when r < 0.22 then 3 when r < 0.50 then 2 else 1 end;
    sh := random() < 0.01; src := case when s.stock >= 1 then 'reserve' else 'bonus' end;
  end if;
  select id into sp from dex_species where tier = t order by random() limit 1;
  select count(*) into before from caught where user_id = me and species = sp;
  insert into caught (user_id, species, shiny, tier) values (me, sp, sh, t) returning id into cid;
  if src = 'reserve' then
    -- réserve pleine : le compte à rebours repart maintenant
    nxt := case when s.stock >= 10 then now() else s.last_tick end;
    update capsule_state set stock = stock - 1, last_tick = nxt where user_id = me;
  elsif src = 'bonus' then update capsule_state set bonus = bonus - 1 where user_id = me;
  else update capsule_state set big = big - 1 where user_id = me;
  end if;
  select * into s from capsule_state where user_id = me;
  return (_capsule_json(s)::jsonb || jsonb_build_object('id', cid, 'species', sp, 'tier', t, 'shiny', sh, 'count', before + 1,
    'kind', case when src = 'grande' then 'grande' else 'normal' end, 'price', capsule_price(t, sh)))::json;
end $$;

-- Vend p_n exemplaires d'un Pokémon (les derniers attrapés d'abord)
create or replace function public.capsule_sell(p_species int, p_shiny boolean default false, p_n int default 1)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; have int; t smallint; gain int; nb int;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_n is null or p_n < 1 or p_n > 1000 then raise exception 'Quantité invalide'; end if;
  perform _capsule_refill(me);
  select count(*) into have from caught where user_id = me and species = p_species and shiny = coalesce(p_shiny, false);
  if have < p_n then raise exception 'Tu n''en as pas assez à vendre'; end if;
  select tier into t from dex_species where id = p_species;
  with del as (delete from caught where id in (select id from caught where user_id = me and species = p_species and shiny = coalesce(p_shiny, false) order by caught_at desc, id desc limit p_n) returning 1)
  select count(*) into nb from del;
  gain := capsule_price(t, coalesce(p_shiny, false)) * nb;
  update capsule_state set coins = coins + gain where user_id = me returning * into s;
  insert into capsule_log (user_id, kind, what, n, coins) values (me, 'vente', p_species::text || case when p_shiny then '✦' else '' end, nb, gain);
  return (_capsule_json(s)::jsonb || jsonb_build_object('gain', gain, 'sold', nb))::json;
end $$;

-- Vend tous les doublons : garde 1 exemplaire normal de chaque Pokémon ; les chromatiques ne sont jamais vendus ici
create or replace function public.capsule_sell_dupes()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; gain int := 0; nb int := 0;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  perform _capsule_refill(me);
  with extra as (
    select c.id, c.tier from (
      select id, tier, row_number() over (partition by species order by caught_at asc, id asc) as rk
      from caught where user_id = me and not shiny) c
    where c.rk > 1
  ), del as (delete from caught where id in (select id from extra) returning tier)
  select coalesce(sum(capsule_price(tier, false)), 0), count(*) into gain, nb from del;
  update capsule_state set coins = coins + gain where user_id = me returning * into s;
  if nb > 0 then insert into capsule_log (user_id, kind, what, n, coins) values (me, 'vente', 'doublons', nb, gain); end if;
  return (_capsule_json(s)::jsonb || jsonb_build_object('gain', gain, 'sold', nb))::json;
end $$;

-- Achète des capsules : 'capsule' (20 éclats) ou 'grande' (150 éclats)
create or replace function public.capsule_buy(p_kind text, p_n int default 1)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; price int; cost int;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_n is null or p_n < 1 or p_n > 100 then raise exception 'Quantité invalide'; end if;
  price := case p_kind when 'capsule' then 20 when 'grande' then 150 else null end;
  if price is null then raise exception 'Article inconnu'; end if;
  cost := price * p_n;
  s := _capsule_refill(me);
  if s.coins < cost then raise exception 'Pas assez d''éclats (il en faut %)', cost; end if;
  if p_kind = 'capsule' then update capsule_state set coins = coins - cost, bonus = bonus + p_n where user_id = me returning * into s;
  else update capsule_state set coins = coins - cost, big = big + p_n where user_id = me returning * into s; end if;
  insert into capsule_log (user_id, kind, what, n, coins) values (me, 'achat', p_kind, p_n, -cost);
  return _capsule_json(s);
end $$;

revoke all on function public._capsule_json(public.capsule_state) from public, anon, authenticated;
grant execute on function public.capsule_status() to authenticated;
grant execute on function public.capsule_open(text) to authenticated;
grant execute on function public.capsule_sell(int, boolean, int) to authenticated;
grant execute on function public.capsule_sell_dupes() to authenticated;
grant execute on function public.capsule_buy(text, int) to authenticated;
grant execute on function public.capsule_price(smallint, boolean) to authenticated;
