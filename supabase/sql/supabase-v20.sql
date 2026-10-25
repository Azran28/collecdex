-- CollecDex v20 (à exécuter UNE fois dans Supabase → SQL Editor → Run, après supabase-v19.sql)
-- Rafale certifiée (v3.58) : on retourne les cartes d'un paquet face cachée l'une après l'autre. Un seul défi
-- « retourne » sert à plusieurs cartes de la rafale (p_n usages, 30 au plus) : sinon la limite de 40 défis en
-- 10 minutes bloquait une grosse rafale. La réponse dit combien de cartes le défi peut certifier (« uses »).
-- cert_finish ne change pas : il compte déjà les usages (max_uses) et refuse un défi de plus de 15 minutes.

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
  elsif p_kind = 'rafale' then
    c := 'retourne';                                     -- même geste que la carte seule, carte par carte
    uses := greatest(1, least(coalesce(p_n, 1), 30));
  else
    c := 'retourne';
  end if;
  insert into cert_challenges (user_id, challenge, max_uses) values (me, c, uses) returning id into rid;
  return json_build_object('id', rid, 'challenge', c, 'uses', uses);
end $$;

revoke all on function public.cert_start(text, int) from public, anon;
grant execute on function public.cert_start(text, int) to authenticated;
