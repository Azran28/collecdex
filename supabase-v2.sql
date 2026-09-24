-- CollecDex v2 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-certif.sql)
-- 1) Certification d'une page de classeur (un défi pour plusieurs cartes)
-- 2) Pseudos uniques

-- ===== 1) Certification : un défi peut servir à plusieurs cartes d'une même page =====
alter table public.cert_challenges add column if not exists max_uses int not null default 1;
alter table public.cert_challenges add column if not exists uses int not null default 0;
alter table public.certifications add column if not exists challenge_id uuid;

drop function if exists public.cert_start();
create or replace function public.cert_start(p_kind text default 'carte')
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; rid uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if (select count(*) from cert_challenges where user_id = me and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Trop de captures d''affilée, réessaie dans quelques minutes';
  end if;
  delete from cert_challenges where created_at < now() - interval '1 day';
  c := (array['approche', 'eloigne', 'gauche', 'droite'])[1 + floor(random() * 4)::int];
  insert into cert_challenges (user_id, challenge, max_uses) values (me, c, case when p_kind = 'page' then 16 else 1 end) returning id into rid;
  return json_build_object('id', rid, 'challenge', c);
end $$;

create or replace function public.cert_finish(p_id uuid, p_key text, p_photo text, p_dhash text, p_scores jsonb)
returns json language plpgsql security definer set search_path = public, storage as $$
declare me uuid := auth.uid(); ch cert_challenges; h bit(64); obj record;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into ch from cert_challenges where id = p_id and user_id = me for update;
  if not found then return json_build_object('ok', false, 'reason', 'Défi inconnu'); end if;
  if ch.used or ch.uses >= ch.max_uses then return json_build_object('ok', false, 'reason', 'Défi déjà utilisé'); end if;
  update cert_challenges set uses = uses + 1, used = (uses + 1 >= max_uses) where id = p_id;
  if ch.created_at < now() - interval '15 minutes' then return json_build_object('ok', false, 'reason', 'Capture trop ancienne (plus de 15 minutes)'); end if;
  if coalesce((p_scores ->> 'passed')::boolean, false) is not true or p_scores ->> 'challenge' is distinct from ch.challenge then
    return json_build_object('ok', false, 'reason', 'Vérification en direct non réussie');
  end if;
  if coalesce((p_scores ->> 'recognized')::boolean, false) is not true then
    return json_build_object('ok', false, 'reason', 'Carte pas reconnue sur la photo');
  end if;
  -- la photo doit avoir été envoyée APRÈS le début du défi
  select created_at, updated_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/' || p_photo || '.jpg';
  if not found then return json_build_object('ok', false, 'reason', 'Photo introuvable en ligne'); end if;
  if greatest(obj.created_at, coalesce(obj.updated_at, obj.created_at)) < ch.created_at then
    return json_build_object('ok', false, 'reason', 'Photo antérieure à la capture');
  end if;
  -- la même image ne peut pas servir deux fois (autre compte, ou autre carte hors de la même page)
  h := ('x' || lpad(p_dhash, 16, '0'))::bit(64);
  if exists (select 1 from certifications where bit_count(dhash # h) <= 3
             and (user_id <> me or (key <> p_key and challenge_id is distinct from p_id))) then
    return json_build_object('ok', false, 'reason', 'Cette image a déjà servi pour une autre certification');
  end if;
  insert into certifications (user_id, photo_id, key, dhash, challenge, scores, challenge_id)
  values (me, p_photo, p_key, h, ch.challenge, p_scores, p_id)
  on conflict (user_id, photo_id) do nothing;
  return json_build_object('ok', true);
end $$;

revoke all on function public.cert_start(text) from public, anon;
revoke all on function public.cert_finish(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.cert_start(text) to authenticated;
grant execute on function public.cert_finish(uuid, text, text, text, jsonb) to authenticated;

-- ===== 2) Pseudos uniques (sans tenir compte des majuscules) =====
create table if not exists public.pseudos (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  pseudo     text        not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists pseudos_unique_lower on public.pseudos (lower(pseudo));
alter table public.pseudos enable row level security;
revoke all on public.pseudos from anon, authenticated;
grant select on public.pseudos to authenticated;
drop policy if exists "pseudos: lisibles par les connectés" on public.pseudos;
create policy "pseudos: lisibles par les connectés" on public.pseudos for select to authenticated using (true);

create or replace function public.claim_pseudo(p text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if char_length(v) < 3 or char_length(v) > 20 then return json_build_object('ok', false, 'reason', 'Entre 3 et 20 caractères'); end if;
  if v !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]+$' then return json_build_object('ok', false, 'reason', 'Lettres, chiffres, espace, point, tiret et _ seulement'); end if;
  if exists (select 1 from pseudos where lower(pseudo) = lower(v) and user_id <> me) then
    return json_build_object('ok', false, 'reason', 'Ce pseudo est déjà pris');
  end if;
  insert into pseudos (user_id, pseudo) values (me, v)
  on conflict (user_id) do update set pseudo = excluded.pseudo, updated_at = now();
  return json_build_object('ok', true, 'pseudo', v);
exception when unique_violation then
  return json_build_object('ok', false, 'reason', 'Ce pseudo est déjà pris');
end $$;
revoke all on function public.claim_pseudo(text) from public, anon;
grant execute on function public.claim_pseudo(text) to authenticated;
