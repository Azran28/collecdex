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
  // Démarrage rapide : l'appli n'attend plus le serveur pour s'afficher. La session gardée sur l'appareil
  // (même stockage que supabase-js) donne tout de suite le compte connecté ; init() la confirme ensuite.
  // Tout ce qui parle au serveur attend `ready` (module de connexion chargé, session vérifiée).
  let readyDone; const ready = new Promise((r) => { readyDone = r; });
  if (enabled) {
    try {
      const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
      const s = k ? JSON.parse(localStorage.getItem(k) || 'null') : null;
      if (s && s.user && s.user.id) { user = s.user; state = 'synchro'; }
    } catch (e) { /* stockage illisible : on attendra init() */ }
  } else readyDone();
  const waitReady = async () => { if (!sb) await ready; return !!sb; };

  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const setState = (s, err = '') => { state = s; lastError = err; emit(); };
  const savePend = App.util.debounce(() => App.db.set('kv', 'cloudPending', pend).catch(() => {}), 300);
  const uid = () => user && user.id;
  const photoPath = (id) => `${uid()}/${id}.jpg`;

  const loadLib = () => new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
    const s = document.createElement('script');
    // version figée + empreinte : le navigateur refuse le fichier s'il a été modifié sur le CDN
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
    s.integrity = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('Impossible de charger le module de connexion (internet ?)'));
    document.head.appendChild(s);
  });
  // téléchargement lancé tout de suite, pendant que le reste du site se prépare (l'accueil s'affiche plus vite)
  let libP = null;
  const getLib = () => libP || (libP = loadLib().catch((e) => { libP = null; throw e; }));
  if (enabled) getLib().catch(() => {});

  async function init() {
    if (!enabled) return;
    const p = await App.db.get('kv', 'cloudPending').catch(() => null);
    if (p) pend = Object.assign(pend, p);
    try {
      // lien d'un e-mail « {{ .SiteURL }}?token_hash=…&type=recovery » : marche même ouvert sur un autre appareil
      // (le lien « ?code=… » de Supabase ne marche que dans le navigateur qui a demandé l'e-mail)
      const q = new URLSearchParams(location.search), otp = q.get('token_hash') && { token_hash: q.get('token_hash'), type: q.get('type') || 'recovery' };
      if (otp) { q.delete('token_hash'); q.delete('type'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
      const lib = await getLib();
      sb = lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
      // l'échange du « ?code=… » a lieu pendant getSession : on écoute tout de suite pour ne pas rater « mot de passe oublié »
      let recovery = false;
      const early = sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') recovery = true; });
      const { data, error } = await sb.auth.getSession();
      early.data.subscription.unsubscribe();
      // hors ligne au lancement (jeton à renouveler, pas de réseau) : on garde le compte de l'appareil
      const hadUser = !!user, offline = !data.session && error && isNetErr(error) && user;
      if (!offline) user = data.session ? data.session.user : null;
      if (hadUser && !user) setTimeout(() => App.util.toast('Ta session a expiré : reconnecte-toi. Tes changements sont gardés sur cet appareil.', 6000), 600);
      readyDone();
      sb.auth.onAuthStateChange((ev, session) => {
        const was = uid();
        user = session ? session.user : null;
        if (ev === 'PASSWORD_RECOVERY') location.hash = '#/connexion?reset=1';
        if (user && user.id !== was) sync();
        if (!user) setState('deconnecte'); else emit();
      });
      // retire le « ?code=… » laissé par le lien de confirmation
      if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
      if (recovery && user) location.hash = '#/connexion?reset=1';
      if (otp) {
        // vérifié par le serveur → connexion ; « recovery » → page « Nouveau mot de passe », « email » = confirmation de l'inscription
        const before = uid(), r = await sb.auth.verifyOtp(otp), reset = otp.type === 'recovery';
        if (r.error) {
          location.hash = '#/connexion';
          setTimeout(() => App.util.toast(reset ? 'Ce lien n’est plus valable (déjà utilisé ou trop ancien) : redemande un e-mail avec « Mot de passe oublié ».'
            : 'Ce lien de confirmation n’est plus valable (déjà utilisé ou trop ancien). Si ton adresse est déjà confirmée, connecte-toi simplement.', 7000), 400);
        } else {
          if (reset) location.hash = '#/connexion?reset=1';
          else setTimeout(() => App.util.toast('Adresse e-mail confirmée ✓ Bienvenue sur CollecDex !', 5000), 400);
          if (uid() !== before) return; // autre compte : l'écouteur ci-dessus a déjà lancé la synchro
        }
      }
      if (offline) setState('erreur', 'Hors ligne : synchronisation au retour du réseau');
      else if (user) sync(); else setState('deconnecte');
    } catch (e) {
      console.warn(e);
      setState('erreur', e.message);
    }
    readyDone();
    window.addEventListener('online', () => { if (user) { if (sb && state === 'erreur') sync(); else flush(); } });
  }

  // ---------- Session expirée ----------
  // Le jeton de connexion (JWT) dure 1 h et se renouvelle tout seul… sauf si l'appli est restée en arrière-plan,
  // hors ligne, ou si la session a été fermée ailleurs : le serveur répond alors « JWT expired ».
  // On tente de le renouveler ; si c'est impossible, on se déconnecte proprement (au lieu d'une interface bloquée).
  const isAuthErr = (e) => {
    const m = String((e && (e.message || e.msg || e.error_description)) || e || '');
    const c = String((e && (e.code || e.status || e.statusCode)) || '');
    return /jwt|token (is )?expired|invalid (refresh )?token|refresh token|auth session missing|session.*(expired|not found)/i.test(m) || /^(401|PGRST30[0-3])$/.test(c);
  };
  // panne de réseau : ce n'est pas une session expirée, on ne déconnecte pas
  const isNetErr = (e) => !!e && (e.status === 0 || e.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(String(e.message || '')));
  let expiring = false, authFails = 0;
  async function expire() {
    if (expiring || !user) return;
    expiring = true;
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* déjà plus de session */ }
    user = null; authFails = 0; clearTimeout(retryTimer); clearTimeout(timer);
    setState('deconnecte');
    expiring = false;
    App.util.toast('Ta session a expiré : reconnecte-toi. Tes changements sont gardés sur cet appareil.', 6000);
  }
  /** Après une erreur de session : vrai si le jeton a pu être renouvelé (on peut réessayer), sinon déconnexion */
  async function renew() {
    if (!user) return false;
    if (++authFails <= 2) {
      try {
        const { data, error } = await sb.auth.refreshSession();
        if (!error && data && data.session) { user = data.session.user; return true; }
        if (error && isNetErr(error)) return false; // hors ligne : on garde la session, on réessaiera plus tard
      } catch (e) { if (isNetErr(e)) return false; }
    }
    await expire();
    return false;
  }
  // retour sur l'appli (téléphone sorti de veille) : on vérifie la session tout de suite
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !sb || !user) return;
    try {
      const { data, error } = await sb.auth.getSession();
      if (!(data && data.session) && !(error && isNetErr(error))) await expire();
    } catch (e) { /* réseau : rien */ }
  });

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
    if (!sb && (!(await waitReady()) || !user || flushing)) return;
    if (!pendingCount()) { if (state !== 'ok') setState('ok'); return; }
    flushing = true;
    setState('envoi');
    try {
      const me = uid();
      // 1) photos
      for (const id of Object.keys(pend.photos)) {
        const blob = await App.db.get('photos', id);
        // photo déjà certifiée : elle est en ligne et le serveur refuse de la remplacer (supabase-v17.sql)
        if (blob && !(App.certify && App.certify.photoCertified(id))) {
          // le nom reste en .jpg (le serveur s'en sert), le contenu peut être du WebP
          const type = /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob.type : 'image/jpeg';
          const { error } = await sb.storage.from('photos').upload(photoPath(id), blob, { upsert: true, contentType: type });
          // refus définitif du serveur (photo certifiée figée, plafond du compte, photo trop lourde) : on ne bloque pas la synchro
          if (error && /row-level security|maximum allowed size|too large|413/i.test(String(error.message) + ' ' + (error.statusCode || ''))) {
            console.warn('photo refusée par le serveur', id, error.message);
            if (!/row-level/i.test(error.message) || !App.certify.photoCertified(id)) App.util.toast('Une photo n’a pas pu être gardée dans ton compte (place du compte pleine ?)', 5000);
          } else if (error) throw error;
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
      lastSync = Date.now(); authFails = 0;
      setState('ok');
    } catch (e) {
      console.warn('Synchronisation', e);
      flushing = false;
      if (isAuthErr(e) && await renew()) { clearTimeout(retryTimer); retryTimer = setTimeout(flush, 300); return; }
      if (!user) return; // session expirée : déconnecté (les changements restent en attente pour la prochaine connexion)
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
    if (!(await waitReady()) || !user) return;
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
          App.col.onlinePhotos(it).forEach((id) => { pend.photos[id] = 1; });
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
        // seulement les photos gardées dans le compte : les autres n'existent que sur cet appareil
        const online = new Set(App.col.all().flatMap((it) => App.col.onlinePhotos(it)));
        for (const id of Object.keys(local)) if (online.has(id) && !pend.photos[id] && remote.size) await App.db.del('photos', id).catch(() => {});
        await App.db.set('kv', 'photosRefreshed1', 1);
        changed++;
      }
      savePend();
      await loadCerts();
      lastSync = Date.now(); authFails = 0;
      if (changed) App.col.notify();
      setState('ok');
      flush();
    } catch (e) {
      console.warn('Synchronisation', e);
      if (isAuthErr(e) && await renew()) { sync(); return; }
      if (user) setState('erreur', e.message || String(e));
    }
  }

  /** Certifications de ce compte (lecture seule : seul le serveur peut en créer) */
  async function loadCerts() {
    if (!App.certify) return;
    const { data, error } = await sb.from('certifications').select('photo_id,key,created_at,challenge');
    if (error) { console.info('Certification pas encore activée sur le serveur', error.message); return; }
    App.certify.setFromServer(data || []);
  }

  /** Appel d'une fonction du serveur */
  async function rpc(name, args = {}) {
    if (!user) throw new Error('Connexion requise');
    if (!(await waitReady())) throw new Error('Connexion au serveur impossible (internet ?)');
    let { data, error } = await sb.rpc(name, args);
    if (error && isAuthErr(error)) {
      if (!(await renew())) throw new Error(user ? 'Connexion au serveur impossible (internet ?)' : 'Ta session a expiré : reconnecte-toi');
      ({ data, error } = await sb.rpc(name, args));
    }
    if (error) throw new Error(error.message);
    authFails = 0;
    return data;
  }

  /** Fonction du serveur ouverte à tous (vitrine publique) : marche aussi sans être connecté */
  async function publicRpc(name, args = {}) {
    if (!enabled) throw new Error('Pas de serveur configuré');
    for (let i = 0; i < 80 && !sb; i++) await new Promise((r) => setTimeout(r, 125)); // le module de connexion se charge
    if (!sb) throw new Error('Connexion au serveur impossible (internet ?)');
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
  const noPhoto = new Set(); // photos absentes du compte (gardées sur un autre appareil) : on ne les redemande pas
  async function fetchPhoto(id) {
    if (!user || !id || noPhoto.has(id)) return null;
    if (!(await waitReady()) || !user) return null;
    const { data, error } = await sb.storage.from('photos').download(photoPath(id));
    if (error || !data) { if (error && !isNetErr(error)) noPhoto.add(id); return null; }
    await App.db.set('photos', id, data);
    return data;
  }

  /** Photo d'un ami (lecture seule, autorisée par le serveur seulement si vous êtes amis) */
  const friendPhotos = new Map();
  function fetchFriendPhoto(owner, id) {
    const k = owner + '/' + id;
    if (!friendPhotos.has(k)) {
      friendPhotos.set(k, (async () => {
        if (!(await waitReady())) return '';
        if (!user) return '';
        const { data, error } = await sb.storage.from('photos').download(`${owner}/${id}.jpg`);
        return error || !data ? '' : URL.createObjectURL(data);
      })().catch(() => ''));
    }
    return friendPhotos.get(k);
  }
  /** Photo d'une vitrine publique (le serveur ne laisse lire que les visuels choisis des vitrines publiques) */
  function fetchPublicPhoto(owner, id) {
    const k = 'pub:' + owner + '/' + id;
    if (!friendPhotos.has(k)) {
      friendPhotos.set(k, (async () => {
        if (!sb) return '';
        const { data, error } = await sb.storage.from('photos').download(`${owner}/${id}.jpg`);
        return error || !data ? '' : URL.createObjectURL(data);
      })().catch(() => ''));
    }
    return friendPhotos.get(k);
  }
  /** Mon pseudo réservé sur le serveur (null si aucun) */
  async function myPseudo() {
    if (!user) return null;
    if (!(await waitReady()) || !user) return null;
    const { data } = await sb.from('pseudos').select('pseudo').eq('user_id', user.id).maybeSingle();
    return data ? data.pseudo : null;
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
    if (!(await waitReady())) throw new Error('Connexion au serveur impossible (internet ?)');
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
    if (error) throw new Error(tr(error));
    return { needsConfirm: !data.session };
  }
  async function signIn(email, password) {
    if (!(await waitReady())) throw new Error('Connexion au serveur impossible (internet ?)');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(tr(error));
  }
  async function signOut() {
    if (App.notify) await App.notify.disable().catch(() => {}); // plus de notifications de ce compte sur cet appareil
    if (await waitReady()) await sb.auth.signOut().catch(() => {}); user = null; setState('deconnecte'); }
  /**
   * Supprime définitivement le compte : photos du dossier photos/<id>/ (par l'API de stockage),
   * puis tout le reste côté serveur (delete_my_account, supabase-v13.sql, tout part en cascade).
   */
  async function deleteAccount() {
    if (!(await waitReady()) || !user) throw new Error('Connexion requise');
    const me = uid();
    clearTimeout(timer); clearTimeout(retryTimer);
    for (let i = 0; i < 60 && flushing; i++) await new Promise((r) => setTimeout(r, 250));
    const notInstalled = (e) => /delete_my_account/.test(e.message) ? new Error('La suppression n’est pas encore installée sur le serveur (script supabase-v13.sql).') : new Error(e.message);
    // 0) la fonction du serveur existe-t-elle ? (sinon on n'efface surtout pas les photos)
    const chk = await sb.rpc('delete_my_account', { p_check: true });
    if (chk.error) throw notInstalled(chk.error);
    if (App.notify) await App.notify.disable().catch(() => {});
    // 1) photos (on relit la liste jusqu'à ce qu'elle soit vide)
    for (let round = 0; round < 200; round++) {
      const { data, error } = await sb.storage.from('photos').list(me, { limit: 100 });
      if (error) throw new Error('Effacement des photos impossible : ' + error.message);
      if (!data || !data.length) break;
      const { error: e2 } = await sb.storage.from('photos').remove(data.map((f) => `${me}/${f.name}`));
      if (e2) throw new Error('Effacement des photos impossible : ' + e2.message);
    }
    // 2) compte et données
    const { error } = await sb.rpc('delete_my_account');
    if (error) throw notInstalled(error);
    // 3) plus rien à envoyer, déconnexion sur cet appareil (le compte n'existe plus côté serveur)
    pend = { items: {}, dels: {}, photos: {}, photoDels: {}, profile: false };
    await App.db.del('kv', 'cloudPending').catch(() => {});
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    user = null; setState('deconnecte');
  }
  async function resetPassword(email) {
    if (!(await waitReady())) throw new Error('Connexion au serveur impossible (internet ?)');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
    if (error) throw new Error(tr(error));
  }
  async function newPassword(password) {
    if (!(await waitReady())) throw new Error('Connexion au serveur impossible (internet ?)');
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(tr(error));
  }

  return {
    enabled, init, sync, flush, flushNow, rpc, publicRpc, fetchPhoto, fetchFriendPhoto, fetchPublicPhoto, myPseudo,
    markItem, markDelete, markPhoto, markPhotoDelete, markProfile,
    signUp, signIn, signOut, resetPassword, newPassword, deleteAccount,
    get user() { return user; }, get state() { return state; }, get error() { return lastError; },
    get lastSync() { return lastSync; }, pendingCount,
    _test: { isAuthErr, isNetErr },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
