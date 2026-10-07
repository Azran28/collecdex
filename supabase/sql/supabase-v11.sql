-- CollecDex v11 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v10.sql)
-- Notification « Nouvelle demande d'ami » sur le téléphone de celui qui la reçoit.
--  • Envoyée par la même fonction que les capsules (« hyper-processor ») : à remettre à jour avec le nouveau code
--    (supabase/functions/capsule-notify/index.ts) dans Edge Functions.
--  • Dès qu'une demande est faite, le serveur appelle la fonction tout de suite (sinon, au plus tard 5 minutes après).
--  • Une seule notification par demande ; les demandes déjà en attente avant ce script ne sont pas renvoyées.
--  • Chaque appareil peut la couper (Paramètres › Notifications › « Je reçois une demande d'ami »).
--  • On peut relancer ce script sans risque.

-- Demande déjà annoncée ? (les anciennes demandes sont marquées « déjà annoncées »)
alter table public.friendships add column if not exists notified boolean not null default true;
alter table public.friendships alter column notified set default false;

-- Appareils à prévenir maintenant (demandes reçues pas encore annoncées) ; utilisée seulement par la fonction d'envoi
create or replace function public.push_due_friends()
returns table (endpoint text, p256dh text, auth text, pseudo text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record;
begin
  for r in
    select f.a, f.b, coalesce(ps.pseudo, 'Un dresseur') as who from friendships f
    left join pseudos ps on ps.user_id = f.a
    where f.status = 'pending' and not f.notified
    for update of f skip locked
  loop
    update friendships set notified = true where friendships.a = r.a and friendships.b = r.b;
    -- trop ancienne (plus d'un jour) : on la marque sans l'annoncer
    if exists (select 1 from friendships f2 where f2.a = r.a and f2.b = r.b and f2.created_at > now() - interval '1 day') then
      return query select p.endpoint, p.p256dh, p.auth, r.who from push_subs p
        where p.user_id = r.b and coalesce((p.kinds ->> 'friends')::boolean, true);
    end if;
  end loop;
end $$;
revoke all on function public.push_due_friends() from public, anon, authenticated;
grant execute on function public.push_due_friends() to service_role;

-- Appel immédiat de la fonction d'envoi à chaque nouvelle demande (sans attendre le passage des 5 minutes).
-- En cas de souci, la demande d'ami passe quand même (la notification partira au passage suivant).
create or replace function public._friend_notify_now()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'pending' then
    begin
      perform net.http_post(
        url := 'https://zjzfwhtqrigfmqzfebzy.supabase.co/functions/v1/hyper-processor',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb);
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke all on function public._friend_notify_now() from public, anon, authenticated;
drop trigger if exists friend_notify_now on public.friendships;
create trigger friend_notify_now after insert on public.friendships
  for each row execute function public._friend_notify_now();
