-- CollecDex v23 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v22.sql)
-- Les 28 formes de Zarbi (les 26 lettres, « ! » et « ? »), sur le même modèle que les 18 formes d'Arceus :
-- chaque Zarbi tiré est une forme que le dresseur n'a pas encore ; une fois les 28 réunies, au hasard.
-- Les Zarbi déjà attrapés reçoivent chacun une lettre différente, tirée au hasard.

-- formes de chaque Pokémon (null = pas de formes), même ordre que js/pokedex.js › FORMS_OF ; la 1re = image normale
create or replace function public.pokemon_forms(sp int)
returns text[] language sql immutable as $$
  select case sp
    when 493 then arceus_forms()
    when 201 then array['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
                        'u', 'v', 'w', 'x', 'y', 'z', 'exclamation', 'question']
    else null end;
$$;

-- les Zarbi déjà attrapés : une lettre différente pour chacun (dans un ordre au hasard, propre à chaque dresseur)
do $$
declare u uuid; arr text[]; r record; i int;
begin
  for u in select distinct user_id from public.caught where species = 201 and form is null loop
    select array_agg(f order by random()) into arr from unnest(public.pokemon_forms(201)) f;
    i := 0;
    for r in select id from public.caught where user_id = u and species = 201 and form is null order by caught_at, id loop
      update public.caught set form = arr[(i % 28) + 1] where id = r.id;
      i := i + 1;
    end loop;
  end loop;
end $$;

-- Ouvre une capsule : comme supabase-v22.sql, mais la forme vaut pour tout Pokémon qui en a (Arceus, Zarbi)
create or replace function public.capsule_open(p_kind text default 'normal')
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; r float8 := random(); t smallint; sp int; sh boolean; before int; cid bigint; nxt timestamptz; src text;
  fm text := null; fbefore int := 0; pf text[];
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
  pf := pokemon_forms(sp);
  if pf is not null then
    -- une forme qu'il n'a pas encore, sinon n'importe laquelle
    select f into fm from unnest(pf) f
      where f not in (select coalesce(form, pf[1]) from caught where user_id = me and species = sp)
      order by random() limit 1;
    if fm is null then fm := pf[1 + floor(random() * array_length(pf, 1))::int]; end if;
    select count(*) into fbefore from caught where user_id = me and species = sp and coalesce(form, pf[1]) = fm;
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
