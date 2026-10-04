/*
 * Notifications (même site fermé) : l'appareil s'abonne auprès du serveur (supabase-v7.sql),
 * qui envoie « ta réserve de 10 capsules est pleine » et « nouvelle demande d'ami » (fonction capsule-notify, supabase-v11.sql).
 * Le choix est propre à chaque appareil (téléphone, ordinateur…) et lié au compte connecté.
 */
App.notify = (() => {
  const KINDS = [['capsules', 'Ma réserve de capsules est pleine (10 capsules à ouvrir)'], ['friends', 'Je reçois une demande d’ami']].filter(([k]) => !(App.play && k === 'capsules'));
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
  const ios = () => App.install && App.install.isIOS;

  /** 'unsupported' | 'ios-install' (iPhone : il faut l'appli installée) | 'denied' | 'on' | 'off' */
  async function state() {
    if (!supported()) return ios() && !App.install.standalone() ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const sub = await subscription();
    return sub && (await prefs()).on ? 'on' : 'off';
  }
  async function subscription() {
    try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }
  const prefs = async () => Object.assign({ on: false, kinds: { capsules: true, friends: true } }, (await App.db.get('kv', 'notify').catch(() => null)) || {});
  const savePrefs = (p) => App.db.set('kv', 'notify', p).catch(() => {});

  // clé publique VAPID (texte base64url) → octets
  const keyBytes = (b64) => {
    const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };
  const isMissing = (e) => /push_|schema cache|does not exist|Could not find/i.test(String(e && e.message));

  async function send(sub, kinds) {
    const j = sub.toJSON();
    await App.cloud.rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_kinds: kinds });
  }

  /** Active les notifications sur cet appareil (demande l'autorisation au navigateur) */
  async function enable() {
    if (!App.cloud.user) throw new Error('Connecte-toi d’abord : les notifications sont liées à ton compte.');
    if (!supported()) throw new Error(ios() ? 'Sur iPhone, installe d’abord CollecDex sur l’écran d’accueil (Paramètres › Application), puis active les notifications depuis l’appli.' : 'Ce navigateur ne gère pas les notifications.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications bloquées : autorise-les pour ce site dans les réglages du navigateur.' : 'Autorisation refusée.');
    let key;
    try { key = await App.cloud.rpc('push_public_key'); } catch (e) { throw new Error(isMissing(e) ? 'Il reste une étape : lancer supabase-v7.sql dans Supabase.' : e.message); }
    if (!key) throw new Error('Le serveur de notifications n’est pas encore prêt (fonction capsule-notify à créer dans Supabase, ou quelques minutes à attendre).');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) { // abonnement fait avec une autre clé : on le refait
      const old = sub.options && sub.options.applicationServerKey;
      if (old && btoa(String.fromCharCode(...new Uint8Array(old))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key.replace(/=+$/, '')) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const p = await prefs();
    await send(sub, p.kinds);
    p.on = true; await savePrefs(p);
    notify();
  }

  /** Coupe les notifications sur cet appareil */
  async function disable() {
    const sub = await subscription();
    if (sub) {
      if (App.cloud.user) await App.cloud.rpc('push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    const p = await prefs(); p.on = false; await savePrefs(p);
    notify();
  }

  /** Choisit quelles notifications recevoir */
  async function setKind(kind, on) {
    const p = await prefs(); p.kinds[kind] = !!on; await savePrefs(p);
    const sub = await subscription();
    if (p.on && sub && App.cloud.user) await send(sub, p.kinds);
    notify();
  }

  /** Notification d'essai (vérifie que l'appareil les affiche bien) */
  async function test() {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('CollecDex', { body: 'Les notifications marchent sur cet appareil ✓', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'test', data: { url: '#/parametres' } });
  }

  /** Bloc des Paramètres */
  function panel(host) {
    const draw = async () => {
      const st = await state(), p = await prefs();
      const msg = {
        unsupported: 'Ce navigateur ne gère pas les notifications.',
        'ios-install': 'Sur iPhone, les notifications ne marchent qu’avec l’appli installée : installe CollecDex sur ton écran d’accueil (bloc Application), puis ouvre-la et reviens ici.',
        denied: 'Les notifications sont bloquées pour ce site : autorise-les dans les réglages du navigateur (cadenas à gauche de l’adresse), puis reviens ici.',
      }[st];
      host.innerHTML = `<p class="muted small">Reçois une alerte sur cet appareil, même quand le site est fermé.</p>
        ${msg ? `<p class="small">${msg}</p>` : `
        <label class="check"><input type="checkbox" id="nt-on" ${st === 'on' ? 'checked' : ''} ${App.cloud.user ? '' : 'disabled'}> <b>Notifications sur cet appareil</b></label>
        ${App.cloud.user ? '' : '<p class="small muted"><a href="#/connexion">Connecte-toi</a> pour activer les notifications.</p>'}
        <div class="nt-kinds" ${st === 'on' ? '' : 'hidden'}>
          ${KINDS.map(([k, l]) => `<label class="check small"><input type="checkbox" data-kind="${k}" ${p.kinds[k] !== false ? 'checked' : ''}> ${l}</label>`).join('<br>')}
        </div>
        <p class="small" id="nt-msg" style="margin-bottom:0"></p>`}`;
    };
    const say = (t, ok) => { const m = host.querySelector('#nt-msg'); if (m) { m.textContent = t; m.style.color = ok ? 'var(--ok)' : '#ff8a8a'; } };
    host.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'nt-on') {
        t.disabled = true;
        try { if (t.checked) { await enable(); App.util.toast('Notifications activées ✓'); } else { await disable(); App.util.toast('Notifications coupées'); } }
        catch (err) { t.checked = false; await draw(); say(err.message); return; }
        await draw();
      }
      if (t.dataset.kind) { try { await setKind(t.dataset.kind, t.checked); App.util.toast('Enregistré ✓'); } catch (err) { say(err.message); } }
    });
    listeners.add(draw);
    const off = App.cloud.on(draw);
    draw();
    return () => { listeners.delete(draw); off(); };
  }

  // compte connecté sur cet appareil : on renvoie l'abonnement (nouveau compte, ou préférences d'un autre appareil)
  let lastUser;
  App.cloud.on(async () => {
    const u = App.cloud.user ? App.cloud.user.id : null;
    if (u === lastUser) return;
    lastUser = u;
    if (!u || !supported() || Notification.permission !== 'granted') return;
    const p = await prefs(), sub = await subscription();
    if (p.on && sub) send(sub, p.kinds).catch(() => {});
  });

  return { KINDS, supported, state, enable, disable, setKind, test, panel, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
})();
