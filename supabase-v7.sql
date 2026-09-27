-- CollecDex v7 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v6.sql)
-- 1) Nouvelle certification : retourner la carte (voir plus bas).
-- 2) Notifications sur le téléphone / l'ordinateur, même site fermé : « ta réserve de 10 capsules est pleine ».
-- Fonctionnement : toutes les 5 minutes, le serveur (pg_cron) appelle la fonction « capsule-notify »
-- (à créer dans Edge Functions, voir LISEZ-MOI.md), qui envoie la notification aux appareils abonnés.

-- ===== Appareils abonnés aux notifications =====
create table if not exists public.push_subs (
  endpoint   text primary key,                                   -- adresse du service de notification de l'appareil
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  kinds      jsonb not null default '{"capsules": true}'::jsonb,  -- quelles notifications cet appareil veut
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;
grant select on public.push_subs to authenticated;
drop policy if exists "notifications: les miennes" on public.push_subs;
create policy "notifications: les miennes" on public.push_subs for select to authenticated using ((select auth.uid()) = user_id);

-- Clés d'envoi (VAPID), créées toutes seules par la fonction capsule-notify au premier passage.
-- Personne ne peut les lire depuis le site : seul le serveur y a accès.
create table if not exists public.push_config (
  id            int primary key check (id = 1),
  vapid_public  text not null,
  vapid_private text not null,
  subject       text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
-- seule la fonction d'envoi (rôle serveur) lit et crée les clés, et retire les appareils désabonnés
grant select, insert on public.push_config to service_role;
grant select, delete on public.push_subs to service_role;

-- Clé publique (celle-là peut être donnée à tout le monde)
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select vapid_public from push_config where id = 1;
$$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- S'abonner (ou changer ses préférences) depuis cet appareil
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_kinds jsonb default '{"capsules": true}'::jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'Abonnement invalide';
  end if;
  if jsonb_typeof(p_kinds) <> 'object' or pg_column_size(p_kinds) > 1000 then raise exception 'Préférences invalides'; end if;
  if (select count(*) from push_subs where user_id = me and endpoint <> p_endpoint) >= 10 then
    delete from push_subs where endpoint = (select endpoint from push_subs where user_id = me order by created_at limit 1);
  end if;
  insert into push_subs (endpoint, user_id, p256dh, auth, kinds) values (p_endpoint, me, p_p256dh, p_auth, p_kinds)
  on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, kinds = excluded.kinds;
  return json_build_object('ok', true);
end $$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  delete from push_subs where endpoint = p_endpoint and user_id = auth.uid();
  return json_build_object('ok', true);
end $$;
revoke all on function public.push_subscribe(text, text, text, jsonb) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, jsonb) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;

-- ===== Réserve pleine : une seule notification tant qu'on n'a pas rouvert de capsule =====
alter table public.capsule_state add column if not exists notified_full boolean not null default false;

-- ouvrir une capsule (la réserve baisse) : on pourra être prévenu à nouveau
create or replace function public._capsule_notif_reset()
returns trigger language plpgsql as $$
begin
  if new.stock < old.stock then new.notified_full := false; end if;
  return new;
end $$;
drop trigger if exists capsule_notif_reset on public.capsule_state;
create trigger capsule_notif_reset before update on public.capsule_state
  for each row execute function public._capsule_notif_reset();

-- Appareils à prévenir maintenant (réserve pleine, pas encore prévenus) ; utilisée seulement par capsule-notify
create or replace function public.push_due_capsules()
returns table (endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare u uuid;
begin
  for u in
    select s.user_id from capsule_state s
    where not s.notified_full
      and s.stock + floor(extract(epoch from (now() - s.last_tick)) / 3600) >= 10
      and exists (select 1 from push_subs p where p.user_id = s.user_id and coalesce((p.kinds ->> 'capsules')::boolean, true))
  loop
    update capsule_state set notified_full = true where capsule_state.user_id = u;
    return query select p.endpoint, p.p256dh, p.auth from push_subs p
      where p.user_id = u and coalesce((p.kinds ->> 'capsules')::boolean, true);
  end loop;
end $$;
revoke all on function public.push_due_capsules() from public, anon, authenticated;
grant execute on function public.push_due_capsules() to service_role;

-- ===== Certification : il faut RETOURNER la carte (montrer le dos puis la face) =====
-- Bouger le téléphone devant un écran suffisait avec l'ancien défi (approche / éloigne / gauche / droite).
-- Nouveau défi unique « retourne » ; plus de certification pour une page de classeur (on recapture la carte seule).
create or replace function public.cert_start(p_kind text default 'carte')
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_kind = 'page' then raise exception 'Pas de certification pour une page de classeur : capture la carte seule'; end if;
  if (select count(*) from cert_challenges where user_id = me and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Trop de captures d''affilée, réessaie dans quelques minutes';
  end if;
  delete from cert_challenges where created_at < now() - interval '1 day';
  insert into cert_challenges (user_id, challenge, max_uses) values (me, 'retourne', 1) returning id into rid;
  return json_build_object('id', rid, 'challenge', 'retourne');
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
  if ch.challenge <> 'retourne' then return json_build_object('ok', false, 'reason', 'Ancien défi : recommence la capture'); end if;
  if coalesce((p_scores ->> 'passed')::boolean, false) is not true or p_scores ->> 'challenge' is distinct from ch.challenge then
    return json_build_object('ok', false, 'reason', 'Vérification en direct non réussie');
  end if;
  if coalesce((p_scores ->> 'recognized')::boolean, false) is not true then
    return json_build_object('ok', false, 'reason', 'Carte pas reconnue sur la photo');
  end if;
  -- la photo ET la bande du retournement doivent avoir été envoyées APRÈS le début du défi
  select created_at, updated_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/' || p_photo || '.jpg';
  if not found then return json_build_object('ok', false, 'reason', 'Photo introuvable en ligne'); end if;
  if greatest(obj.created_at, coalesce(obj.updated_at, obj.created_at)) < ch.created_at then
    return json_build_object('ok', false, 'reason', 'Photo antérieure à la capture');
  end if;
  select created_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/cert_' || p_id::text || '.jpg';
  if not found or obj.created_at < ch.created_at then return json_build_object('ok', false, 'reason', 'Film du retournement introuvable'); end if;
  -- la même image ne peut pas servir deux fois (autre compte, ou autre carte)
  h := ('x' || lpad(p_dhash, 16, '0'))::bit(64);
  if exists (select 1 from certifications where bit_count(dhash # h) <= 3 and (user_id <> me or key <> p_key)) then
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

-- ===== Boutique : message « Pas assez d'éclats » corrigé (la base affichait « Pas assez de d'éclats ») =====
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

-- ===== Passage automatique toutes les 5 minutes =====
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'capsule-notify';
select cron.schedule('capsule-notify', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://zjzfwhtqrigfmqzfebzy.supabase.co/functions/v1/hyper-processor', -- nom donné par Supabase à la fonction
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb) $$);
