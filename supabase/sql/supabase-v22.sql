-- CollecDex v22 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v21.sql)
-- Les 18 formes d'Arceus (une par type : Normal + les 17 plaques). Chaque Arceus tiré est une forme que le
-- dresseur n'a pas encore ; une fois les 18 réunies, la forme est tirée au hasard.
-- La vente garde une forme de chaque : on vend d'abord les exemplaires en double d'une même forme.

alter table public.caught add column if not exists form text;
update public.caught set form = 'normal' where species = 493 and form is null;

-- les 18 formes, dans l'ordre du Pokédex du site (js/pokedex.js › FORMS)
create or replace function public.arceus_forms()
returns text[] language sql immutable as $$
  select array['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
               'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
$$;

-- Ouvre une capsule : comme supabase-v21.sql, plus la forme d'Arceus ('form', et 'form_count' = exemplaires de cette forme)
create or replace function public.capsule_open(p_kind text default 'normal')
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; r float8 := random(); t smallint; sp int; sh boolean; before int; cid bigint; nxt timestamptz; src text;
  fm text := null; fbefore int := 0;
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
  if random() < 0.001 then t := 7; end if; -- Arceus
  select id into sp from dex_species where tier = t order by random() limit 1;
  if sp = 493 then
    -- une forme qu'il n'a pas encore, sinon n'importe laquelle
    select f into fm from unnest(arceus_forms()) f
      where f not in (select coalesce(form, 'normal') from caught where user_id = me and species = 493)
      order by random() limit 1;
    if fm is null then fm := (arceus_forms())[1 + floor(random() * 18)::int]; end if;
    select count(*) into fbefore from caught where user_id = me and species = 493 and coalesce(form, 'normal') = fm;
  end if;
  select count(*) into before from caught where user_id = me and species = sp;
  insert into caught (user_id, species, shiny, tier, form) values (me, sp, sh, t, fm) returning id into cid;
  if src = 'reserve' then
    -- réserve pleine : le compte à rebours repart maintenant
    nxt := case when s.stock >= 10 then now() else s.last_tick end;
    update capsule_state set stock = stock - 1, last_tick = nxt where user_id = me;
  elsif src = 'bonus' then update capsule_state set bonus = bonus - 1 where user_id = me;
  else update capsule_state set big = big - 1 where user_id = me;
  end if;
  select * into s from capsule_state where user_id = me;
  return (_capsule_json(s)::jsonb || jsonb_build_object('id', cid, 'species', sp, 'tier', t, 'shiny', sh, 'count', before + 1,
    'form', fm, 'form_count', fbefore + 1,
    'kind', case when src = 'grande' then 'grande' else 'normal' end, 'price', capsule_price(t, sh)))::json;
end $$;
grant execute on function public.capsule_open(text) to authenticated;

-- Mes formes : une ligne par forme attrapée (seulement les Pokémon qui ont des formes : Arceus)
create or replace function public.capsule_forms()
returns table (species int, form text, n int, shiny int)
language sql security definer set search_path = public as $$
  select species, form, count(*)::int, count(*) filter (where shiny)::int
  from caught where user_id = auth.uid() and form is not null group by species, form order by species, form;
$$;
grant execute on function public.capsule_forms() to authenticated;

-- Vend p_n exemplaires d'un Pokémon : d'abord les doubles d'une même forme (les derniers attrapés d'abord),
-- le premier exemplaire de chaque forme en dernier
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
  with del as (delete from caught where id in (
      select id from (
        select id, caught_at, row_number() over (partition by coalesce(form, '') order by caught_at asc, id asc) as rk
        from caught where user_id = me and species = p_species and shiny = coalesce(p_shiny, false)) x
      order by (rk > 1) desc, caught_at desc, id desc limit p_n) returning 1)
  select count(*) into nb from del;
  gain := capsule_price(t, coalesce(p_shiny, false)) * nb;
  update capsule_state set coins = coins + gain where user_id = me returning * into s;
  insert into capsule_log (user_id, kind, what, n, coins) values (me, 'vente', p_species::text || case when p_shiny then '✦' else '' end, nb, gain);
  return (_capsule_json(s)::jsonb || jsonb_build_object('gain', gain, 'sold', nb))::json;
end $$;

-- Vend tous les doublons : garde 1 exemplaire normal de chaque Pokémon (et de chaque forme) ; jamais les chromatiques
create or replace function public.capsule_sell_dupes()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; gain int := 0; nb int := 0;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  perform _capsule_refill(me);
  with extra as (
    select c.id, c.tier from (
      select id, tier, row_number() over (partition by species, coalesce(form, '') order by caught_at asc, id asc) as rk
      from caught where user_id = me and not shiny) c
    where c.rk > 1
  ), del as (delete from caught where id in (select id from extra) returning tier)
  select coalesce(sum(capsule_price(tier, false)), 0), count(*) into gain, nb from del;
  update capsule_state set coins = coins + gain where user_id = me returning * into s;
  if nb > 0 then insert into capsule_log (user_id, kind, what, n, coins) values (me, 'vente', 'doublons', nb, gain); end if;
  return (_capsule_json(s)::jsonb || jsonb_build_object('gain', gain, 'sold', nb))::json;
end $$;
