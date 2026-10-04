/*
 * Amis : demandes par pseudo, liste, vitrine d'un ami (supabase-v4.sql).
 * Les invitations par lien (#/amis?ajout=Pseudo) sont gardées tant qu'on n'est pas connecté.
 */
App.friends = (() => {
  let rows = null, missing = false;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  const isMissing = (e) => /friend_|schema cache|does not exist|Could not find/i.test(String(e && e.message));

  // ---------- Données venant d'un AUTRE dresseur : on ne leur fait jamais confiance ----------
  // (chacun écrit ce qu'il veut dans sa propre collection : on ne garde que des valeurs attendues,
  //  pour qu'aucun texte piégé ne puisse s'exécuter dans ta page)
  const str = (v, max = 200) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const photoId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
  // visuels : TCGdex, ou une carte hors-série du site (img/hors-serie/…)
  const tcgImg = (v) => (typeof v === 'string' && (/^https:\/\/assets\.tcgdex\.net\/[A-Za-z0-9_./-]+$/.test(v) || /^img\/hors-serie\/[a-z0-9-]+$/.test(v)) ? v : '');
  const game = (v) => (typeof v === 'string' && App.games.get(v) ? v : null);
  const oneOf = (v, list, def) => (list.some(([k]) => k === v) ? v : def);
  const avatarPoke = (a) => { a = obj(a); const id = parseInt(a.id, 10); return id >= 1 && id <= App.pokedex.TOTAL ? { id, shiny: !!a.shiny } : null; };

  function cleanItem(it) {
    it = obj(it);
    const g = game(it.game); if (!g) return null;
    const s = obj(it.snap), c = obj(it.cond), p = obj(it.price);
    const cond = c.kind === 'graded' && App.col.GRADERS.includes(c.company) ? { kind: 'graded', company: c.company, grade: num(c.grade) }
      : c.kind === 'raw' && App.col.CONDITIONS.some((r) => r[0] === c.grade) ? { kind: 'raw', grade: c.grade } : null;
    return {
      key: str(it.key), game: g, id: str(it.id), setId: str(it.setId), qty: Math.max(0, Math.floor(num(it.qty))),
      lang: /^[a-z]{2}$/.test(it.lang) ? it.lang : 'fr', favorite: !!it.favorite, addedAt: num(it.addedAt),
      variants: Array.isArray(it.variants) ? it.variants.map((v) => str(v, 20)) : [],
      photos: Array.isArray(it.photos) ? it.photos.map(photoId).filter(Boolean) : [], displayPhoto: photoId(it.displayPhoto),
      cond, valueOverride: Math.max(0, num(it.valueOverride)),
      price: p.value != null ? { value: num(p.value), unit: p.unit === 'USD' ? 'USD' : 'EUR' } : null,
      snap: { name: str(s.name), localId: str(s.localId, 20), image: tcgImg(s.image), rarity: str(s.rarity, 60), setName: str(s.setName), serieId: str(s.serieId, 40), holo: !!s.holo, official: num(s.official) || null },
    };
  }
  function cleanProfile(pr) {
    pr = obj(pr);
    const V = App.views.showcase;
    const frames = {};
    for (const [k, f] of Object.entries(obj(pr.frames))) if (V.FRAMES.some(([x]) => x === f)) frames[str(k)] = f;
    return {
      bio: str(pr.bio, 1000), theme: oneOf(pr.theme, V.THEMES, 'nuit'), frame: oneOf(pr.frame, V.FRAMES, 'or'), layout: oneOf(pr.layout, V.LAYOUTS, 'vedette'),
      featured: Array.isArray(pr.featured) ? pr.featured.slice(0, 9).map((k) => str(k)) : [], frames,
      avatarPoke: avatarPoke(pr.avatarPoke), avatar: photoId(pr.avatar),
      showStats: pr.showStats !== false, showBadges: pr.showBadges !== false, showTop: pr.showTop !== false, showWish: pr.showWish !== false, showCerts: pr.showCerts !== false,
      stats: (Array.isArray(pr.stats) ? pr.stats : []).filter((k) => V.STATS.some(([x]) => x === k)).slice(0, 4),
      wishlist: (Array.isArray(pr.wishlist) ? pr.wishlist : []).map(obj).filter((w) => game(w.game)).slice(0, 500).map((w) => ({
        game: w.game, id: str(w.id), setId: str(w.setId), name: str(w.name), setName: str(w.setName), localId: str(w.localId, 20), serieId: str(w.serieId, 40), image: tcgImg(w.image),
      })),
    };
  }
  const cleanRow = (r) => { r = obj(r); return UUID.test(r.user_id) ? { user_id: r.user_id, pseudo: str(r.pseudo, 40) || 'Dresseur', avatar: avatarPoke(r.avatar), status: r.status === 'accepted' ? 'accepted' : 'pending', incoming: !!r.incoming, since: r.since, cards: Math.max(0, Math.floor(num(r.cards))) } : null; };

  async function list({ fresh = false } = {}) {
    if (!App.cloud.enabled || !App.cloud.user) { rows = null; return []; }
    if (rows && !fresh) return rows;
    try { rows = ((await App.cloud.rpc('friend_list')) || []).map(cleanRow).filter(Boolean); missing = false; }
    catch (e) { if (isMissing(e)) missing = true; rows = []; throw e; }
    notify();
    return rows;
  }
  const pendingIn = () => (rows || []).filter((r) => r.incoming).length;

  async function request(pseudo) { const r = await App.cloud.rpc('friend_request', { p_pseudo: pseudo }); await list({ fresh: true }).catch(() => {}); return r; }
  async function respond(uid, accept) { await App.cloud.rpc('friend_respond', { p_user: uid, p_accept: accept }); await list({ fresh: true }).catch(() => {}); }
  async function remove(uid) { await App.cloud.rpc('friend_remove', { p_user: uid }); await list({ fresh: true }).catch(() => {}); }
  async function showcase(uid) {
    if (!UUID.test(uid)) throw new Error('Dresseur introuvable');
    const d = obj(await App.cloud.rpc('friend_showcase', { p_user: uid }));
    return {
      pseudo: str(d.pseudo, 40), profile: cleanProfile(d.profile),
      items: (Array.isArray(d.items) ? d.items : []).map(cleanItem).filter(Boolean),
      certs: (Array.isArray(d.certs) ? d.certs : []).map(obj).map((c) => ({ photo_id: str(c.photo_id), key: str(c.key) })),
    };
  }

  // ---------- Bloquer / signaler (supabase-v14.sql) ----------
  const REASONS = [
    ['pseudo', 'Pseudo ou présentation choquants'],
    ['vitrine', 'Contenu choquant dans sa vitrine'],
    ['photos', 'Photos inappropriées'],
    ['harcelement', 'Harcèlement, insultes, spam'],
    ['triche', 'Triche ou fausses cartes certifiées'],
    ['autre', 'Autre chose'],
  ];
  const v14 = (e) => (/friend_block|friend_unblock|friend_blocked|friend_report|schema cache|Could not find/i.test(String(e && e.message))
    ? new Error('Il reste une étape : lancer le script supabase-v14.sql dans Supabase (SQL Editor).') : e);
  let blockedRows = null;
  async function blocked({ fresh = false } = {}) {
    if (!App.cloud.user) return [];
    if (blockedRows && !fresh) return blockedRows;
    try {
      blockedRows = ((await App.cloud.rpc('friend_blocked')) || []).map(obj)
        .filter((r) => UUID.test(r.user_id)).map((r) => ({ user_id: r.user_id, pseudo: str(r.pseudo, 40) || 'Dresseur' }));
    } catch (e) { blockedRows = null; throw v14(e); }
    return blockedRows;
  }
  async function block(uid) {
    if (!UUID.test(uid)) throw new Error('Dresseur introuvable');
    let r; try { r = obj(await App.cloud.rpc('friend_block', { p_user: uid })); } catch (e) { throw v14(e); }
    if (!r.ok) throw new Error(str(r.reason) || 'Blocage impossible');
    blockedRows = null; await list({ fresh: true }).catch(() => {});
  }
  async function unblock(uid) {
    try { await App.cloud.rpc('friend_unblock', { p_user: uid }); } catch (e) { throw v14(e); }
    blockedRows = null;
  }
  async function report(uid, reason, details, alsoBlock) {
    if (!UUID.test(uid)) throw new Error('Dresseur introuvable');
    let r; try { r = obj(await App.cloud.rpc('friend_report', { p_user: uid, p_reason: reason, p_details: str(details, 500), p_block: !!alsoBlock })); } catch (e) { throw v14(e); }
    if (!r.ok) throw new Error(str(r.reason) || 'Signalement impossible');
    if (alsoBlock) { blockedRows = null; await list({ fresh: true }).catch(() => {}); }
  }

  /**
   * Menu « … » d'un dresseur : signaler et/ou bloquer. Renvoie 'block' | 'report' | null (rien fait).
   * Utilisé dans « Mes amis » et sur la vitrine d'un autre dresseur.
   */
  async function moderate(uid, name) {
    const { esc } = App.util;
    const pick = await App.util.ask({ icon: 'shield', title: name || 'Ce dresseur', text: 'Un problème avec ce dresseur ?', choices: [
      { label: 'Signaler', value: 'report', kind: 'primary' },
      { label: 'Bloquer', value: 'block', kind: 'danger' },
    ] });
    if (pick === 'block') {
      if (!await App.util.ask({ icon: 'shield', danger: true, title: `Bloquer ${name || 'ce dresseur'} ?`, text: 'Vous ne serez plus amis, il ne pourra plus t’envoyer de demande ni rejoindre tes combats, et il ne verra plus ta vitrine d’ami. Il n’est pas prévenu. Tu pourras le débloquer dans « Mes amis ».', ok: 'Bloquer' })) return null;
      try { await block(uid); App.util.toast(`${name || 'Dresseur'} est bloqué`); return 'block'; } catch (e) { App.util.toast(e.message, 5000); return null; }
    }
    if (pick !== 'report') return null;
    return new Promise((resolve) => {
      let done = null;
      const box = App.util.openModal(`<h2>${App.icons.icon('shield', 20)} Signaler ${esc(name || 'ce dresseur')}</h2>
        <p class="small muted">Ton signalement est envoyé à l’équipe de CollecDex, qui le vérifiera. ${esc(name || 'Ce dresseur')} ne saura pas qui l’a signalé.</p>
        <form id="rp-form">
          <div class="rp-reasons">${REASONS.map(([k, l]) => `<label class="check"><input type="radio" name="rp-r" value="${k}"> ${esc(l)}</label>`).join('')}</div>
          <p><label>Précisions (facultatif)<br><textarea id="rp-details" maxlength="500" rows="3" style="width:100%" placeholder="Ce qui s’est passé…"></textarea></label></p>
          <p><label class="check"><input type="checkbox" id="rp-block" checked> Bloquer aussi ce dresseur</label></p>
          <div class="row"><button class="btn primary" type="submit" id="rp-go" disabled>Envoyer le signalement</button><button class="btn ghost" type="button" data-close>Annuler</button></div>
          <p class="small" id="rp-msg"></p>
        </form>`, () => resolve(done));
      box.addEventListener('change', () => { box.querySelector('#rp-go').disabled = !box.querySelector('input[name=rp-r]:checked'); });
      box.querySelector('#rp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = box.querySelector('input[name=rp-r]:checked'); if (!r) return;
        const go = box.querySelector('#rp-go'), m = box.querySelector('#rp-msg'), bl = box.querySelector('#rp-block').checked;
        go.disabled = true; m.style.color = ''; m.textContent = 'Envoi…';
        try {
          await report(uid, r.value, box.querySelector('#rp-details').value, bl);
          done = bl ? 'block' : 'report';
          App.util.toast(bl ? 'Merci, signalement envoyé. Ce dresseur est bloqué.' : 'Merci, signalement envoyé.', 4000);
          App.util.closeModal();
        } catch (err) { m.style.color = '#ff8a8a'; m.textContent = err.message; go.disabled = false; }
      });
    });
  }

  /** Vitrine publique d'un dresseur, par son pseudo (supabase-v9.sql) : lisible par tout le monde, même sans compte */
  async function publicShowcase(pseudo) {
    let d;
    try { d = obj(await App.cloud.publicRpc('public_showcase', { p_pseudo: str(pseudo, 40) })); }
    catch (e) { throw new Error(/public_showcase|schema cache|Could not find/i.test(e.message) ? 'Les vitrines publiques ne sont pas encore activées sur le serveur.' : e.message); }
    if (!d.ok || !UUID.test(d.user_id)) throw new Error(str(d.reason) || 'Cette vitrine n’existe pas ou n’est pas publique');
    return {
      user_id: d.user_id, pseudo: str(d.pseudo, 40), photos: d.photos !== false, profile: cleanProfile(d.profile),
      items: (Array.isArray(d.items) ? d.items : []).map(cleanItem).filter(Boolean),
      certs: (Array.isArray(d.certs) ? d.certs : []).map(obj).map((c) => ({ photo_id: str(c.photo_id), key: str(c.key) })),
    };
  }
  /** Adresse de la vitrine publique (à partager) */
  const publicLink = (pseudo) => `${location.origin}${location.pathname}#/@${encodeURIComponent(pseudo)}`;

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
    lastUser = u; rows = null; blockedRows = null; missing = false;
    if (u) list({ fresh: true }).catch(() => {}); else notify();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && App.cloud.user) list({ fresh: true }).catch(() => {}); });

  return {
    blocked, block, unblock, report, moderate, REASONS,
    list, request, respond, remove, showcase, publicShowcase, publicLink, inviteLink, pendingIn, saveInvite, takeInvite, clearInvite,
    get missing() { return missing; },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
