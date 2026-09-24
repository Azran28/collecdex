/*
 * Compte en ligne + synchronisation (Supabase).
 *
 * Principe : tout est d'abord enregistré sur l'appareil (rapide, marche hors ligne),
 * puis envoyé dans ton compte. À l'ouverture du site, on récupère ce qui a changé
 * ailleurs (autre appareil). Chaque carte garde sa date de modification : la plus
 * récente gagne.
 *
 * Base de données : tables `items` (une ligne par carte possédée) et `profiles`
 * (vitrine + réglages). Photos : espace de stockage `photos`, un dossier par utilisateur.
 */
App.cloud = (() => {
  const cfg = App.config || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);
  let sb = null, user = null, flushing = false, timer = null, retryTimer = null;
  let state = enabled ? 'deconnecte' : 'local', lastError = '', lastSync = 0;
  const listeners = new Set();
  let pend = { items: {}, dels: {}, photos: {}, photoDels: {}, profile: false };

  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const setState = (s, err = '') => { state = s; lastError = err; emit(); };
  const savePend = App.util.debounce(() => App.db.set('kv', 'cloudPending', pend).catch(() => {}), 300);
  const uid = () => user && user.id;
  const photoPath = (id) => `${uid()}/${id}.jpg`;

  const loadLib = () => new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('Impossible de charger le module de connexion (internet ?)'));
    document.head.appendChild(s);
  });

  async function init() {
    if (!enabled) return;
    const p = await App.db.get('kv', 'cloudPending').catch(() => null);
    if (p) pend = Object.assign(pend, p);
    try {
      const lib = await loadLib();
      sb = lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
      const { data } = await sb.auth.getSession();
      user = data.session ? data.session.user : null;
      sb.auth.onAuthStateChange((ev, session) => {
        const was = uid();
        user = session ? session.user : null;
        if (ev === 'PASSWORD_RECOVERY') location.hash = '#/compte?reset=1';
        if (user && user.id !== was) sync();
        if (!user) setState('deconnecte'); else emit();
      });
      // retire le « ?code=… » laissé par le lien de confirmation
      if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
      if (user) sync(); else setState('deconnecte');
    } catch (e) {
      console.warn(e);
      setState('erreur', e.message);
    }
    window.addEventListener('online', () => { if (user) flush(); });
  }

  // ---------- Modifications locales à envoyer ----------
  function schedule() {
    savePend();
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 1200);
  }
  const markItem = (k) => { if (!enabled) return; pend.items[k] = 1; delete pend.dels[k]; schedule(); };
  const markDelete = (k, photoIds = []) => { if (!enabled) return; pend.dels[k] = 1; delete pend.items[k]; photoIds.forEach(markPhotoDelete); schedule(); };
  const markPhoto = (id) => { if (!enabled || !id) return; pend.photos[id] = 1; delete pend.photoDels[id]; schedule(); };
  const markPhotoDelete = (id) => { if (!enabled || !id) return; delete pend.photos[id]; pend.photoDels[id] = 1; schedule(); };
  const markProfile = () => { if (!enabled) return; pend.profile = true; schedule(); };
  const pendingCount = () => Object.keys(pend.items).length + Object.keys(pend.dels).length + Object.keys(pend.photos).length + Object.keys(pend.photoDels).length + (pend.profile ? 1 : 0);

  async function flush() {
    if (!user || flushing) return;
    if (!pendingCount()) { if (state !== 'ok') setState('ok'); return; }
    flushing = true;
    setState('envoi');
    try {
      const me = uid();
      // 1) photos
      for (const id of Object.keys(pend.photos)) {
        const blob = await App.db.get('photos', id);
        if (blob) {
          const { error } = await sb.storage.from('photos').upload(photoPath(id), blob, { upsert: true, contentType: 'image/jpeg' });
          if (error) throw error;
        }
        delete pend.photos[id]; savePend(); emit();
      }
      const dels = Object.keys(pend.photoDels);
      if (dels.length) {
        const { error } = await sb.storage.from('photos').remove(dels.map(photoPath));
        if (error) throw error;
        dels.forEach((id) => delete pend.photoDels[id]); savePend();
      }
      // 2) cartes
      const keys = Object.keys(pend.items);
      for (let i = 0; i < keys.length; i += 200) {
        const rows = keys.slice(i, i + 200).map((k) => App.col.byKey(k)).filter(Boolean)
          .map((it) => ({ user_id: me, key: it.key, data: it, deleted: false, updated_at: it.updatedAt || Date.now() }));
        if (rows.length) { const { error } = await sb.from('items').upsert(rows); if (error) throw error; }
        keys.slice(i, i + 200).forEach((k) => delete pend.items[k]); savePend(); emit();
      }
      const dk = Object.keys(pend.dels);
      if (dk.length) {
        const { error } = await sb.from('items').upsert(dk.map((k) => ({ user_id: me, key: k, data: {}, deleted: true, updated_at: Date.now() })));
        if (error) throw error;
        dk.forEach((k) => delete pend.dels[k]); savePend();
      }
      // 3) vitrine + réglages
      if (pend.profile) {
        const profile = await App.col.getProfile();
        const settings = { ...App.settings };
        const { error } = await sb.from('profiles').upsert({ user_id: me, profile, settings, updated_at: Math.max(profile.updatedAt || 0, settings.updatedAt || 0, 1) });
        if (error) throw error;
        pend.profile = false; savePend();
      }
      lastSync = Date.now();
      setState('ok');
    } catch (e) {
      console.warn('Synchronisation', e);
      setState('erreur', e.message || String(e));
      clearTimeout(retryTimer); retryTimer = setTimeout(flush, 30000);
    } finally {
      flushing = false;
    }
    if (pendingCount() && state === 'ok') flush();
  }

  // ---------- Récupération depuis le compte ----------
  async function sync() {
    if (!user) return;
    setState('synchro');
    try {
      const me = uid();
      // Un autre compte s'était connecté sur cet appareil ? On repart de zéro pour ne pas mélanger.
      const owner = await App.db.get('kv', 'cloudOwner').catch(() => null);
      if (owner && owner !== me) {
        await App.col.wipeLocal();
        pend = { items: {}, dels: {}, photos: {}, photoDels: {}, profile: false }; savePend();
      }
      await App.db.set('kv', 'cloudOwner', me);

      // cartes
      const remote = new Map();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('items').select('key,data,deleted,updated_at').range(from, from + 999);
        if (error) throw error;
        data.forEach((r) => remote.set(r.key, r));
        if (data.length < 1000) break;
      }
      let changed = 0;
      for (const [k, r] of remote) {
        const local = App.col.byKey(k);
        const lt = local ? local.updatedAt || 0 : 0;
        if (pend.items[k]) continue;
        if (r.deleted) { if (local && lt <= r.updated_at) { await App.col.applyRemoteDelete(k); changed++; } }
        else if (!local || lt < r.updated_at) { await App.col.applyRemote(r.data); changed++; }
      }
      // cartes présentes seulement sur cet appareil (ex. ta collection d'avant le compte) → on les envoie
      for (const it of App.col.all()) {
        if (!remote.has(it.key) && !pend.dels[it.key]) {
          pend.items[it.key] = 1;
          (it.photos || []).forEach((id) => { pend.photos[id] = 1; });
        }
      }
      // vitrine + réglages
      const { data: prof, error: pe } = await sb.from('profiles').select('profile,settings,updated_at').maybeSingle();
      if (pe) throw pe;
      const localProfile = await App.col.getProfile();
      const localT = Math.max(localProfile.updatedAt || 0, App.settings.updatedAt || 0);
      if (prof && prof.updated_at > localT && !pend.profile) {
        await App.col.applyRemoteProfile(prof.profile, prof.settings);
        changed++;
      } else if (!prof || localT > (prof ? prof.updated_at : 0)) {
        pend.profile = true;
        if (localProfile.avatar) pend.photos[localProfile.avatar] = 1;
      }
      // une fois : on jette les copies locales des photos (certaines, recadrées ailleurs, étaient périmées) ;
      // elles seront retéléchargées depuis le compte à l'affichage
      if (!(await App.db.get('kv', 'photosRefreshed1').catch(() => null))) {
        const local = await App.db.all('photos').catch(() => ({}));
        for (const id of Object.keys(local)) if (!id.startsWith('page_') && !pend.photos[id] && remote.size) await App.db.del('photos', id).catch(() => {});
        await App.db.set('kv', 'photosRefreshed1', 1);
        changed++;
      }
      savePend();
      await loadCerts();
      lastSync = Date.now();
      if (changed) App.col.notify();
      setState('ok');
      flush();
    } catch (e) {
      console.warn('Synchronisation', e);
      setState('erreur', e.message || String(e));
    }
  }

  /** Certifications de ce compte (lecture seule : seul le serveur peut en créer) */
  async function loadCerts() {
    if (!App.certify) return;
    const { data, error } = await sb.from('certifications').select('photo_id,key,created_at');
    if (error) { console.info('Certification pas encore activée sur le serveur', error.message); return; }
    App.certify.setFromServer(data || []);
  }

  /** Appel d'une fonction du serveur */
  async function rpc(name, args = {}) {
    if (!user) throw new Error('Connexion requise');
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  /** Envoie tout de suite ce qui attend (utile avant une certification) */
  async function flushNow() {
    for (let i = 0; i < 60 && flushing; i++) await new Promise((r) => setTimeout(r, 250));
    clearTimeout(timer);
    await flush();
    if (Object.keys(pend.photos).length) throw new Error('Envoi de la photo impossible (connexion ?)');
  }

  /** Photo absente de cet appareil : on la télécharge depuis le compte */
  async function fetchPhoto(id) {
    if (!user || !id) return null;
    const { data, error } = await sb.storage.from('photos').download(photoPath(id));
    if (error || !data) return null;
    await App.db.set('photos', id, data);
    return data;
  }

  // ---------- Compte ----------
  const redirect = () => location.origin + location.pathname;
  const tr = (e) => {
    const m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton e-mail (clique sur le lien reçu), puis reconnecte-toi.';
    if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
    if (/Password should be at least/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
    if (/rate limit/i.test(m)) return 'Trop de tentatives, réessaie dans quelques minutes.';
    return m;
  };
  async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
    if (error) throw new Error(tr(error));
    return { needsConfirm: !data.session };
  }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(tr(error));
  }
  async function signOut() { await sb.auth.signOut(); user = null; setState('deconnecte'); }
  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
    if (error) throw new Error(tr(error));
  }
  async function newPassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(tr(error));
  }

  return {
    enabled, init, sync, flush, flushNow, rpc, fetchPhoto,
    markItem, markDelete, markPhoto, markPhotoDelete, markProfile,
    signUp, signIn, signOut, resetPassword, newPassword,
    get user() { return user; }, get state() { return state; }, get error() { return lastError; },
    get lastSync() { return lastSync; }, pendingCount,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
