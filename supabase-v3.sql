-- CollecDex v3 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v2.sql)
-- Capsules : une nouvelle capsule toutes les heures (10 maximum en réserve).
-- On l'ouvre pour attraper un Pokémon. Le tirage se fait ici, sur le serveur : impossible de tricher avec l'horloge du téléphone.

-- ===== Les 1025 Pokémon et leur rareté (1 commun … 6 fabuleux) =====
create table if not exists public.dex_species (id int primary key, tier smallint not null check (tier between 1 and 6));
insert into public.dex_species (id, tier)
  select i, substr('32332332311111111212121212121131131213121211212121212131213113123123112131122312121121213131231121212131222112122221212132322232133133331323233555124563233233231212111231211112121132122311211211233222122122231223332131212212122133133211211123555124556323323323121211111112112121211312121241211121211121112312122222212122312212111312122222121213323213221212222112123122211244445555555566323323323112121111313323212212212121221212231211213111221241131313122121123333333333333333322555555555666666323323323121131212121212112121131213212311322113112121221131221212212323312131211211212113122121212212121231231211312313312213212122131322124135555555556663233233231211211213113131221212312121213121312333333231242121213135556663233233231121212312212121121312121212131132221312255222222231245555555533333335662333666323323323121121131212121212123122132121313121311311332333212221222221333333124555556555553333335323323323121212112121211321131331212131212132121212113122121332131231323232333333333333333124135555445544213555543444456', i, 1)::smallint from generate_series(1, 1025) i
  on conflict (id) do update set tier = excluded.tier;
alter table public.dex_species enable row level security;
drop policy if exists "dex: lecture" on public.dex_species;
create policy "dex: lecture" on public.dex_species for select using (true);

-- ===== Réserve de capsules de chaque dresseur =====
create table if not exists public.capsule_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stock int not null default 3,          -- 3 capsules offertes pour commencer
  last_tick timestamptz not null default now()
);
alter table public.capsule_state enable row level security;
drop policy if exists "capsules: lecture perso" on public.capsule_state;
create policy "capsules: lecture perso" on public.capsule_state for select using (auth.uid() = user_id);

-- ===== Pokémon attrapés (écrits seulement par capsule_open) =====
create table if not exists public.caught (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  species int not null references public.dex_species (id),
  shiny boolean not null default false,
  tier smallint not null,
  caught_at timestamptz not null default now()
);
create index if not exists caught_user_species on public.caught (user_id, species);
alter table public.caught enable row level security;
drop policy if exists "attrapés: lecture perso" on public.caught;
create policy "attrapés: lecture perso" on public.caught for select using (auth.uid() = user_id);

-- Recharge : +1 capsule par heure écoulée, 10 au maximum
create or replace function public._capsule_refill(me uuid)
returns public.capsule_state language plpgsql security definer set search_path = public as $$
declare s capsule_state; n int;
begin
  insert into capsule_state (user_id) values (me) on conflict (user_id) do nothing;
  select * into s from capsule_state where user_id = me for update;
  n := floor(extract(epoch from (now() - s.last_tick)) / 3600);
  if n > 0 then
    if s.stock + n >= 10 then s.stock := 10; s.last_tick := now();
    else s.stock := s.stock + n; s.last_tick := s.last_tick + make_interval(hours => n); end if;
    update capsule_state set stock = s.stock, last_tick = s.last_tick where user_id = me;
  end if;
  return s;
end $$;
revoke all on function public._capsule_refill(uuid) from public, anon, authenticated;

create or replace function public.capsule_status()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  s := _capsule_refill(me);
  return json_build_object('stock', s.stock, 'max', 10, 'now', now(),
    'next_at', case when s.stock >= 10 then null else s.last_tick + interval '1 hour' end);
end $$;

-- Ouvre une capsule. Chances : commun 50 %, peu commun 28 %, rare 15 %, très rare 4,5 %, légendaire 2 %, fabuleux 0,5 % ; chromatique 1 %.
create or replace function public.capsule_open()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s capsule_state; r float8 := random(); t smallint; sp int; sh boolean; before int; cid bigint; nxt timestamptz;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  s := _capsule_refill(me);
  if s.stock < 1 then raise exception 'Plus de capsule pour l''instant : la prochaine arrive bientôt'; end if;
  t := case when r < 0.005 then 6 when r < 0.025 then 5 when r < 0.07 then 4 when r < 0.22 then 3 when r < 0.50 then 2 else 1 end;
  select id into sp from dex_species where tier = t order by random() limit 1;
  sh := random() < 0.01;
  select count(*) into before from caught where user_id = me and species = sp;
  insert into caught (user_id, species, shiny, tier) values (me, sp, sh, t) returning id into cid;
  -- réserve pleine : le compte à rebours repart maintenant
  nxt := case when s.stock >= 10 then now() else s.last_tick end;
  update capsule_state set stock = stock - 1, last_tick = nxt where user_id = me;
  return json_build_object('id', cid, 'species', sp, 'tier', t, 'shiny', sh, 'count', before + 1,
    'stock', s.stock - 1, 'max', 10, 'now', now(), 'next_at', nxt + interval '1 hour');
end $$;

-- Mon Pokédex : une ligne par espèce attrapée
create or replace function public.capsule_dex()
returns table (species int, n int, shiny int, first_at timestamptz, last_at timestamptz)
language sql security definer set search_path = public as $$
  select species, count(*)::int, count(*) filter (where shiny)::int, min(caught_at), max(caught_at)
  from caught where user_id = auth.uid() group by species order by species;
$$;

grant execute on function public.capsule_status() to authenticated;
grant execute on function public.capsule_open() to authenticated;
grant execute on function public.capsule_dex() to authenticated;
