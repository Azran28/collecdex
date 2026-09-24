-- CollecDex : certification des cartes (à exécuter UNE fois dans Supabase → SQL Editor → Run)
-- Une carte « certifiée » a été capturée en direct avec la caméra, avec un petit défi au hasard.
-- Seul le serveur peut poser le badge : les utilisateurs peuvent LIRE leurs certifications,
-- mais jamais en écrire une directement (pas de règle d'écriture pour eux).

-- 1) Défis envoyés au moment de la capture (usage unique, valables 10 minutes)
create table if not exists public.cert_challenges (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  challenge  text        not null,
  created_at timestamptz not null default now(),
  used       boolean     not null default false
);
alter table public.cert_challenges enable row level security;
revoke all on public.cert_challenges from anon, authenticated;

-- 2) Certifications (une par photo certifiée)
create table if not exists public.certifications (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  photo_id   text        not null,
  key        text        not null,
  dhash      bit(64)     not null,
  challenge  text        not null,
  scores     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, photo_id)
);
alter table public.certifications enable row level security;
revoke all on public.certifications from anon, authenticated;
grant select on public.certifications to authenticated;
drop policy if exists "certifications: lire les siennes" on public.certifications;
create policy "certifications: lire les siennes" on public.certifications
  for select to authenticated using ((select auth.uid()) = user_id);

-- 3) Début de capture : le serveur tire un défi au hasard
create or replace function public.cert_start()
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; rid uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if (select count(*) from cert_challenges where user_id = me and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Trop de captures d''affilée, réessaie dans quelques minutes';
  end if;
  delete from cert_challenges where created_at < now() - interval '1 day';
  c := (array['approche', 'eloigne', 'gauche', 'droite'])[1 + floor(random() * 4)::int];
  insert into cert_challenges (user_id, challenge) values (me, c) returning id into rid;
  return json_build_object('id', rid, 'challenge', c);
end $$;

-- 4) Fin : vérifications côté serveur, puis pose du badge
create or replace function public.cert_finish(p_id uuid, p_key text, p_photo text, p_dhash text, p_scores jsonb)
returns json language plpgsql security definer set search_path = public, storage as $$
declare me uuid := auth.uid(); ch cert_challenges; h bit(64); obj record;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  select * into ch from cert_challenges where id = p_id and user_id = me for update;
  if not found then return json_build_object('ok', false, 'reason', 'Défi inconnu'); end if;
  if ch.used then return json_build_object('ok', false, 'reason', 'Défi déjà utilisé'); end if;
  update cert_challenges set used = true where id = p_id;
  if ch.created_at < now() - interval '10 minutes' then return json_build_object('ok', false, 'reason', 'Capture trop ancienne (plus de 10 minutes)'); end if;
  if coalesce((p_scores ->> 'passed')::boolean, false) is not true or p_scores ->> 'challenge' is distinct from ch.challenge then
    return json_build_object('ok', false, 'reason', 'Vérification en direct non réussie');
  end if;
  -- la photo doit avoir été envoyée APRÈS le début du défi
  select created_at, updated_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/' || p_photo || '.jpg';
  if not found then return json_build_object('ok', false, 'reason', 'Photo introuvable en ligne'); end if;
  if greatest(obj.created_at, coalesce(obj.updated_at, obj.created_at)) < ch.created_at then
    return json_build_object('ok', false, 'reason', 'Photo antérieure à la capture');
  end if;
  -- la même image ne peut pas servir deux fois (autre compte, ou autre carte)
  h := ('x' || lpad(p_dhash, 16, '0'))::bit(64);
  if exists (select 1 from certifications where bit_count(dhash # h) <= 3 and (user_id <> me or key <> p_key)) then
    return json_build_object('ok', false, 'reason', 'Cette image a déjà servi pour une autre certification');
  end if;
  insert into certifications (user_id, photo_id, key, dhash, challenge, scores)
  values (me, p_photo, p_key, h, ch.challenge, p_scores)
  on conflict (user_id, photo_id) do nothing;
  return json_build_object('ok', true);
end $$;

revoke all on function public.cert_start() from public, anon;
revoke all on function public.cert_finish(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.cert_start() to authenticated;
grant execute on function public.cert_finish(uuid, text, text, text, jsonb) to authenticated;
