-- CollecDex v21 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v20.sql)
-- Arceus devient « Dieu » : une rareté à lui seul (7), cachée sur le site (« ??? » tant qu'on ne l'a pas).
-- C'est le Pokémon le plus rare : 0,1 % à chaque capsule (normale ou grande), tiré à part avant la rareté habituelle.
-- Il se revend 500 éclats (×5 s'il est chromatique). Les autres chances ne changent pas.

-- la rareté 7 est permise, Arceus la reçoit (et ses exemplaires déjà attrapés, s'il y en a)
alter table public.dex_species drop constraint if exists dex_species_tier_check;
alter table public.dex_species add constraint dex_species_tier_check check (tier between 1 and 7);
update public.dex_species set tier = 7 where id = 493;
update public.caught set tier = 7 where species = 493;

-- Prix de vente : commun 1, peu commun 3, rare 8, très rare 20, légendaire 100, fabuleux 150, Dieu 500 ; chromatique ×5
create or replace function public.capsule_price(t smallint, sh boolean)
returns int language sql immutable as $$
  select (array[1, 3, 8, 20, 100, 150, 500])[t] * case when sh then 5 else 1 end;
$$;

-- Ouvre une capsule : comme dans supabase-v5.sql, plus la chance d'Arceus (0,1 %) tirée d'abord.
-- Capsule : commun 50 %, peu commun 28 %, rare 15 %, très rare 4,5 %, légendaire 2 %, fabuleux 0,5 % ; chromatique 1 %.
-- Grande capsule : jamais de commun ni de peu commun — rare 45 %, très rare 33 %, légendaire 17 %, fabuleux 5 % ; chromatique 3 %.
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
  if random() < 0.001 then t := 7; end if; -- Arceus
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
grant execute on function public.capsule_open(text) to authenticated;
