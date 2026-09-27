// CollecDex — fonction d'envoi des notifications (Supabase → Edge Functions, nommée « hyper-processor » sur le serveur).
// Appelée toutes les 5 minutes par pg_cron (supabase-v7.sql) : envoie « ta réserve de capsules est pleine »
// aux appareils abonnés. Aucune clé à recopier : les clés d'envoi (VAPID) sont créées ici au premier passage
// et rangées dans la table push_config, que seul le serveur peut lire.
// À déployer avec « Verify JWT » désactivé (pg_cron l'appelle sans jeton). L'appeler n'envoie que les
// notifications réellement dues : sans danger si quelqu'un d'autre l'appelle.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Clé serveur fournie automatiquement par Supabase à la fonction (jamais recopiée à la main) :
// nouvelles clés « sb_secret_… » (SUPABASE_SECRET_KEYS) si elles existent, sinon l'ancienne clé service_role.
function serverKey(): string {
  try {
    const all = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const k = all.default || Object.values(all)[0];
    if (typeof k === 'string' && k) return k;
  } catch (_) { /* pas de nouvelles clés */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
const sb = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });

async function vapid() {
  const { data, error: e1 } = await sb.from('push_config').select('*').eq('id', 1).maybeSingle();
  if (e1) throw new Error('lecture de push_config : ' + e1.message);
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  const row = { id: 1, vapid_public: k.publicKey, vapid_private: k.privateKey, subject: 'https://azran28.github.io/collecdex/' };
  const { error } = await sb.from('push_config').insert(row);
  if (error) { // deux passages en même temps : on relit celle déjà créée
    const { data: again, error: e2 } = await sb.from('push_config').select('*').eq('id', 1).maybeSingle();
    if (!again) throw new Error('création des clés : ' + error.message + (e2 ? ' / ' + e2.message : ''));
    return again;
  }
  return row;
}

Deno.serve(async () => {
  try {
    const k = await vapid();
    webpush.setVapidDetails(k.subject, k.vapid_public, k.vapid_private);
    const { data: due, error } = await sb.rpc('push_due_capsules');
    if (error) throw new Error('push_due_capsules : ' + error.message);
    let sent = 0, gone = 0;
    const payload = JSON.stringify({ title: 'Tes capsules t’attendent !', body: 'Ta réserve est pleine : 10 capsules à ouvrir.', url: '#/capsules', tag: 'capsules-pleines' });
    for (const s of due ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await sb.from('push_subs').delete().eq('endpoint', s.endpoint); gone++; } // appareil désabonné
        else console.error('envoi', code, e);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent, gone }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
