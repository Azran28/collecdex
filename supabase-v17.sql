-- CollecDex v17 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v16.sql)
-- Corrections de l'audit de sécurité du 5 oct. 2026 (aucun changement visible pour un usage normal) :
--  (1) une photo certifiée ne peut plus être remplacée (avant : on gardait le badge en changeant l'image) ;
--  (2) plafonds par compte pour protéger la base gratuite : 100 Mo et 5 000 photos, 1 Mo par photo,
--      25 000 cartes, 16 Ko par carte, 256 Ko pour vitrine + réglages (mesuré : une carte ≈ 1 Ko, une photo ≈ 50 Ko) ;
--  (3) « are_friends » ne répond plus que pour soi (avant : on pouvait savoir si deux autres dresseurs sont amis) ;
--  (4) la vitrine d'un ami ne transmet plus les notes personnelles des cartes (comme la vitrine publique) ;
--  (5) la fonction d'envoi des notifications exige une clé secrète (avant : n'importe qui pouvait la déclencher
--      et user le quota gratuit) — mettre aussi à jour son code (supabase/functions/capsule-notify/index.ts) ;
--  (6) abonnement aux notifications : seulement les vrais services de notification des navigateurs
--      (avant : n'importe quelle adresse https, que le serveur aurait appelée).
-- On peut relancer ce script sans risque.

-- ===== (1) Photo certifiée (et bande-preuve du retournement) : plus modifiable =====
-- chemin « <uid>/<photo>.jpg » ; ne répond que pour son propre dossier
create or replace function public.photo_locked(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_name, '/', 1) = auth.uid()::text and exists (
    select 1 from certifications c
    where c.user_id = auth.uid()
      and (c.photo_id || '.jpg' = split_part(p_name, '/', 2)
           or (c.challenge_id is not null and 'cert_' || c.challenge_id::text || '.jpg' = split_part(p_name, '/', 2))));
$$;
revoke all on function public.photo_locked(text) from public, anon;
grant execute on function public.photo_locked(text) to authenticated;

-- ===== (2) Plafond de photos par compte =====
create or replace function public.photo_quota_ok()
returns boolean language sql stable security definer set search_path = public, storage as $$
  select count(*) < 5000 and coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 100 * 1024 * 1024
  from storage.objects o
  where o.bucket_id = 'photos' and o.name like auth.uid()::text || '/%';
$$;
revoke all on function public.photo_quota_ok() from public, anon;
grant execute on function public.photo_quota_ok() to authenticated;

drop policy if exists "photos: ajouter les siennes" on storage.objects;
create policy "photos: ajouter les siennes" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not public.photo_locked(name) and public.photo_quota_ok());
drop policy if exists "photos: modifier les siennes" on storage.objects;
create policy "photos: modifier les siennes" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.photo_locked(name))
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.photo_locked(name));
-- (supprimer reste permis : nécessaire pour effacer son compte)

-- 1 Mo par photo (avant 5 Mo ; les photos du site font ~30 à 90 Ko)
update storage.buckets set file_size_limit = 1048576 where id = 'photos';

-- ===== (2) Plafonds des cartes et de la vitrine =====
alter table public.items drop constraint if exists items_data_size;
alter table public.items add constraint items_data_size check (pg_column_size(data) <= 16384) not valid;
alter table public.profiles drop constraint if exists profiles_size;
alter table public.profiles add constraint profiles_size check (pg_column_size(profile) + pg_column_size(settings) <= 262144) not valid;

create or replace function public._items_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from items where user_id = new.user_id and key = new.key)
     and (select count(*) from items where user_id = new.user_id) >= 25000 then
    raise exception 'Limite atteinte : 25 000 cartes par compte';
  end if;
  return new;
end $$;
revoke all on function public._items_quota() from public, anon, authenticated;
drop trigger if exists items_quota on public.items;
create trigger items_quota before insert on public.items
  for each row execute function public._items_quota();

-- ===== (3) Amis : on ne peut demander que pour soi =====
create or replace function public.are_friends(x uuid, y text)
returns boolean language sql stable security definer set search_path = public as $$
  select x = auth.uid() and exists (select 1 from friendships f where f.status = 'accepted'
    and ((f.a = x and f.b::text = y) or (f.b = x and f.a::text = y)));
$$;
revoke all on function public.are_friends(uuid, text) from public, anon;
grant execute on function public.are_friends(uuid, text) to authenticated;

-- ===== (4) Vitrine d'un ami : sans les notes personnelles =====
create or replace function public.friend_showcase(p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if p_user is null then raise exception 'Dresseur introuvable'; end if;
  if p_user <> me and not are_friends(me, p_user::text) then raise exception 'Vous n''êtes pas (encore) amis'; end if;
  return json_build_object(
    'pseudo', (select pseudo from pseudos where user_id = p_user),
    'profile', coalesce((select profile - 'goals' - 'favSets' - 'wishlist' - 'showWish' from profiles where user_id = p_user), '{}'::jsonb),
    'items', coalesce((select json_agg(data - 'note' - 'certNote' - 'rating' - 'photoSrc') from items
                       where user_id = p_user and not deleted and coalesce((data ->> 'qty')::int, 0) > 0), '[]'::json),
    'certs', coalesce((select json_agg(json_build_object('photo_id', photo_id, 'key', key)) from certifications where user_id = p_user), '[]'::json)
  );
end $$;
revoke all on function public.friend_showcase(uuid) from public, anon;
grant execute on function public.friend_showcase(uuid) to authenticated;

-- ===== (5) Clé secrète pour appeler la fonction d'envoi des notifications =====
alter table public.push_config add column if not exists call_key text not null
  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- en-têtes de l'appel (lus seulement par le serveur : pg_cron et le déclencheur des demandes d'ami)
create or replace function public._notify_headers()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('Content-Type', 'application/json', 'x-cdx-key', coalesce((select call_key from push_config where id = 1), ''));
$$;
revoke all on function public._notify_headers() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'capsule-notify';
select cron.schedule('capsule-notify', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://zjzfwhtqrigfmqzfebzy.supabase.co/functions/v1/hyper-processor', -- nom donné par Supabase à la fonction
       headers := public._notify_headers(),
       body := '{}'::jsonb) $$);

create or replace function public._friend_notify_now()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'pending' then
    begin
      perform net.http_post(
        url := 'https://zjzfwhtqrigfmqzfebzy.supabase.co/functions/v1/hyper-processor',
        headers := public._notify_headers(),
        body := '{}'::jsonb);
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke all on function public._friend_notify_now() from public, anon, authenticated;

-- ===== (6) Abonnement : seulement les services de notification des navigateurs =====
-- Chrome / Edge Android / Samsung / Opera : fcm.googleapis.com ; Firefox : push.services.mozilla.com ;
-- Safari / iPhone : push.apple.com ; Edge sur PC : notify.windows.com
create or replace function public.push_endpoint_ok(p text)
returns boolean language sql immutable as $$
  select coalesce(p, '') ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/';
$$;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_kinds jsonb default '{"capsules": true}'::jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if not push_endpoint_ok(p_endpoint) or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
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
revoke all on function public.push_subscribe(text, text, text, jsonb) from public, anon;
grant execute on function public.push_subscribe(text, text, text, jsonb) to authenticated;

-- anciens abonnements vers une autre adresse : retirés
delete from public.push_subs where not public.push_endpoint_ok(endpoint);
