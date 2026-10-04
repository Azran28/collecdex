-- CollecDex v13 : suppression de son compte (exigée par Google Play)
-- À exécuter une fois dans Supabase › SQL Editor, après supabase-v12.sql.
--
-- Le site efface d'abord les photos du compte (dossier photos/<id>/, par l'API de stockage :
-- Supabase interdit d'effacer les fichiers directement en SQL), puis appelle cette fonction.
-- Effacer la ligne de auth.users efface tout le reste en cascade (toutes les tables du projet
-- ont « references auth.users (id) on delete cascade ») : cartes, vitrine, pseudo, certifications,
-- défis, capsules, Pokémon attrapés, historique de la boutique, amitiés (des deux côtés),
-- abonnements aux notifications.

create or replace function public.delete_my_account(p_check boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Connexion requise';
  end if;
  -- p_check : le site vérifie seulement que la fonction est installée, AVANT d'effacer les photos
  if p_check then
    return true;
  end if;
  -- sécurité : on ne laisse pas de photos orphelines derrière soi
  if exists (select 1 from storage.objects
             where bucket_id = 'photos' and (storage.foldername(name))[1] = me::text) then
    raise exception 'Il reste des photos dans le compte : réessaie dans un instant.';
  end if;
  delete from auth.users where id = me;
  return true;
end;
$$;

revoke all on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
