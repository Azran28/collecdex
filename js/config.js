/*
 * Connexion au compte en ligne (Supabase).
 * Ces deux valeurs sont publiques par conception : la sécurité vient des règles
 * de la base (chaque utilisateur ne voit que ses propres données).
 * Laisser vide = site en mode local uniquement (sans compte).
 */
App.config = {
  supabaseUrl: 'https://zjzfwhtqrigfmqzfebzy.supabase.co',
  supabaseKey: 'sb_publishable_YvbeiG1CwDvv11X24lPNng_LCqe8BNm',
};
