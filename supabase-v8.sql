-- CollecDex v8 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v7.sql)
-- Certification d'une PAGE de classeur : le serveur tire au sort une case (« case-6 ») ; on fait glisser cette carte
-- hors de sa pochette puis on la remet, devant la caméra. Un seul défi sert pour toutes les cartes de la page.

-- ancien cert_start(p_kind) remplacé par cert_start(p_kind, p_n) (nombre de cases de la page)
drop function if exists public.cert_start(text);
create or replace function public.cert_start(p_kind text default 'carte', p_n int default 9)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; c text; uses int := 1;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if (select count(*) from cert_challenges where user_id = me and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Trop de captures d''affilée, réessaie dans quelques minutes';
  end if;
  delete from cert_challenges where created_at < now() - interval '1 day';
  if p_kind = 'page' then
    if p_n is null or p_n < 2 or p_n > 18 then raise exception 'Nombre de cases invalide'; end if;
    c := 'case-' || (1 + floor(random() * p_n))::int;   -- la carte à faire glisser, tirée au sort ici
    uses := p_n;                                         -- une certification par carte de la page
  else
    c := 'retourne';
  end if;
  insert into cert_challenges (user_id, challenge, max_uses) values (me, c, uses) returning id into rid;
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
  if ch.challenge <> 'retourne' and ch.challenge !~ '^case-[0-9]+$' then return json_build_object('ok', false, 'reason', 'Ancien défi : recommence la capture'); end if;
  if coalesce((p_scores ->> 'passed')::boolean, false) is not true or p_scores ->> 'challenge' is distinct from ch.challenge then
    return json_build_object('ok', false, 'reason', 'Vérification en direct non réussie');
  end if;
  if coalesce((p_scores ->> 'recognized')::boolean, false) is not true then
    return json_build_object('ok', false, 'reason', 'Carte pas reconnue sur la photo');
  end if;
  -- la photo ET le film du geste doivent avoir été envoyés APRÈS le début du défi
  select created_at, updated_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/' || p_photo || '.jpg';
  if not found then return json_build_object('ok', false, 'reason', 'Photo introuvable en ligne'); end if;
  if greatest(obj.created_at, coalesce(obj.updated_at, obj.created_at)) < ch.created_at then
    return json_build_object('ok', false, 'reason', 'Photo antérieure à la capture');
  end if;
  select created_at into obj from storage.objects where bucket_id = 'photos' and name = me::text || '/cert_' || p_id::text || '.jpg';
  if not found or obj.created_at < ch.created_at then return json_build_object('ok', false, 'reason', 'Film de la vérification introuvable'); end if;
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

revoke all on function public.cert_start(text, int) from public, anon;
revoke all on function public.cert_finish(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.cert_start(text, int) to authenticated;
grant execute on function public.cert_finish(uuid, text, text, text, jsonb) to authenticated;
