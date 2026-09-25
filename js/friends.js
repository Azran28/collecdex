/*
 * Amis : demandes par pseudo, liste, vitrine d'un ami (supabase-v4.sql).
 * Les invitations par lien (#/amis?ajout=Pseudo) sont gardées tant qu'on n'est pas connecté.
 */
App.friends = (() => {
  let rows = null, missing = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  const isMissing = (e) => /friend_|schema cache|does not exist|Could not find/i.test(String(e && e.message));

  async function list({ fresh = false } = {}) {
    if (!App.cloud.enabled || !App.cloud.user) { rows = null; return []; }
    if (rows && !fresh) return rows;
    try { rows = (await App.cloud.rpc('friend_list')) || []; missing = false; }
    catch (e) { if (isMissing(e)) missing = true; rows = []; throw e; }
    notify();
    return rows;
  }
  const pendingIn = () => (rows || []).filter((r) => r.incoming).length;

  async function request(pseudo) { const r = await App.cloud.rpc('friend_request', { p_pseudo: pseudo }); await list({ fresh: true }).catch(() => {}); return r; }
  async function respond(uid, accept) { await App.cloud.rpc('friend_respond', { p_user: uid, p_accept: accept }); await list({ fresh: true }).catch(() => {}); }
  async function remove(uid) { await App.cloud.rpc('friend_remove', { p_user: uid }); await list({ fresh: true }).catch(() => {}); }
  const showcase = (uid) => App.cloud.rpc('friend_showcase', { p_user: uid });

  /** Lien d'invitation à partager : ouvre le site et propose de t'ajouter en ami */
  const inviteLink = (pseudo) => `${location.origin}${location.pathname}#/amis?ajout=${encodeURIComponent(pseudo)}`;

  // invitation reçue par lien, gardée jusqu'à la connexion
  const saveInvite = (p) => App.db.set('kv', 'invite', p).catch(() => {});
  const takeInvite = async () => { const p = await App.db.get('kv', 'invite').catch(() => null); return p || null; };
  const clearInvite = () => App.db.del('kv', 'invite').catch(() => {});

  // à la connexion : on charge la liste (pour la pastille des demandes reçues)
  let lastUser;
  App.cloud.on(() => {
    const u = App.cloud.user ? App.cloud.user.id : null;
    if (u === lastUser) return;
    lastUser = u; rows = null; missing = false;
    if (u) list({ fresh: true }).catch(() => {}); else notify();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && App.cloud.user) list({ fresh: true }).catch(() => {}); });

  return {
    list, request, respond, remove, showcase, inviteLink, pendingIn, saveInvite, takeInvite, clearInvite,
    get missing() { return missing; },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
