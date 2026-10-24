/*
 * Scans de test envoyés tout seuls au labo de Claude (v3.52, demande d'Arnaud : « que tu reçoives mes photos automatiquement »).
 * Seulement pour les comptes « testeurs » (table labo_testers de supabase-v19.sql, remplie à la main dans Supabase) :
 * pour tous les autres, rien ne part. Chaque scan = la photo de la carte (WebP 800 px) + ce que le scanner a décidé
 * (carte, version, mesure, sûre ou non) + ce que le dresseur a répondu ou corrigé. Le labo (labo.html?brillant, « Mes scans »)
 * les relit pour mesurer le scanner sur de vraies photos de téléphone.
 * Pas de réseau : le scan attend sur l'appareil (30 au plus) et repart au scan suivant ou au prochain lancement.
 * Seuls les 500 derniers scans sont gardés dans le compte.
 */
App.scanShare = (() => {
  const KEEP = 500, MAX_PEND = 30, K_PEND = 'laboPending', K_TESTER = 'laboTester:';
  let testerP = null, testerFor = null, sent = 0;
  const datas = new Map(); // id → données envoyées pendant cette session (pour y ajouter la réponse ensuite)
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Ce compte est-il testeur ? (demandé au serveur au plus toutes les 12 h) */
  function isTester() {
    const u = App.cloud && App.cloud.enabled && App.cloud.user;
    if (!u) return Promise.resolve(false);
    if (testerFor !== u.id || !testerP) {
      testerFor = u.id;
      testerP = (async () => {
        const hit = await App.db.get('kv', K_TESTER + u.id).catch(() => null);
        if (hit && Date.now() - hit.t < 12 * 3600e3) return hit.v;
        const v = await App.cloud.labo.tester().catch(() => null);
        if (v == null) return hit ? hit.v : false; // (pas de réseau : la dernière réponse connue)
        await App.db.set('kv', K_TESTER + u.id, { v, t: Date.now() }).catch(() => {});
        return v;
      })();
    }
    return testerP;
  }

  const cardRef = (c) => (c ? { id: c.id, name: c.name || '', localId: c.localId || '', set: (c.set && (c.set.name || c.set.id)) || c.setName || c.setId || '' } : null);
  const exists = (c) => (c && c.variants ? Object.keys(c.variants).filter((k) => c.variants[k]) : []);

  async function send(id, game, data, blob) {
    await App.cloud.labo.put(id, game, data, blob);
    if (++sent % 20 === 1) trim().catch(() => {}); // (de temps en temps : on n'en garde que 500)
  }
  async function pending() { return (await App.db.get('kv', K_PEND).catch(() => null)) || []; }
  async function keepForLater(rec) {
    const all = [rec, ...(await pending())];
    await App.db.set('kv', K_PEND, all.slice(0, MAX_PEND)).catch(() => {});
  }
  /** Envoie ce qui attendait sur l'appareil */
  let flushing = false;
  async function flush() {
    if (flushing || !(await isTester())) return;
    flushing = true;
    try {
      let all = await pending();
      while (all.length) {
        const r = all[all.length - 1]; // (le plus ancien d'abord)
        try { await send(r.id, r.game, r.data, r.blob); } catch (e) { break; }
        all = all.slice(0, -1);
        await App.db.set('kv', K_PEND, all).catch(() => {});
      }
    } finally { flushing = false; }
  }
  async function trim() {
    const old = await App.cloud.labo.list({ from: KEEP, to: KEEP + 199 });
    if (old.length) await App.cloud.labo.remove(old.map((r) => r.id));
  }

  /**
   * Un scan à envoyer → son id (tout de suite ; l'envoi se fait en arrière-plan), ou null si ce compte n'est pas testeur.
   * rec = { game, mode: 'carte'|'classeur'|'rafale', kind: 'ajoutee'|'photo'|'aucune'|'corrigee', card, cands, read,
   *         det: { list, sure, info }, picked (version choisie à la main), doubt (version à vérifier) }
   */
  function scan(rec, photo) {
    if (!photo || !App.cloud || !App.cloud.user) return null;
    if (window.top !== window.self) return null; // (site dans un cadre = tests automatiques : rien n'est jamais envoyé)
    const id = newId();
    (async () => {
      if (!(await isTester())) return;
      const det = rec.det || null, info = det && det.info ? det.info : {};
      const data = {
        v: window.APP_VERSION || '', t: Date.now(), mode: rec.mode || 'carte', kind: rec.kind || 'ajoutee',
        card: cardRef(rec.card), exist: exists(rec.card),
        auto: det ? det.list || [] : null, sure: !!(det && (det.sure === true || (det.sure && det.sure.base))),
        mesure: { holoRatio: info.holoRatio, reverseRatio: info.reverseRatio, foil: info.foil ? { score: info.foil.score, lap: info.foil.lap } : (rec.card && rec.card.foil ? { score: rec.card.foil.score, lap: rec.card.foil.lap } : undefined) },
        picked: rec.picked || null, doubt: !!rec.doubt, user: !!rec.user, // (user : version choisie à la main = bonne réponse)
        read: String(rec.read || '').slice(0, 300),
        cands: (rec.cands || []).slice(0, 5).map((c) => ({ ...cardRef(c), sure: !!c.confident })),
      };
      datas.set(id, { game: rec.game, data });
      const blob = await App.util.resizeImage(photo, 800, 0.85, 'image/webp').catch(() => photo);
      try { await send(id, rec.game, data, blob); flush().catch(() => {}); } catch (e) { await keepForLater({ id, game: rec.game, data, blob }); }
    })().catch((e) => console.warn('scans du labo', e));
    return id;
  }
  /** Complète un scan déjà envoyé (ex. la réponse à « Ta carte brille ? », la bonne carte choisie ensuite) */
  function label(id, patch) {
    if (!id) return;
    (async () => {
      for (let i = 0; i < 40 && !datas.has(id); i++) await new Promise((r) => setTimeout(r, 250)); // (envoi encore en préparation)
      const s = datas.get(id); if (!s) return;
      const d = s.data;
      Object.assign(d, patch, { tAnswer: Date.now() });
      try { await App.cloud.labo.put(id, s.game, d, null); } catch (e) { // (upsert : marche même si le 1er envoi n’est pas encore arrivé)
        const all = await pending(), r = all.find((x) => x.id === id);
        if (r) { r.data = d; await App.db.set('kv', K_PEND, all).catch(() => {}); }
      }
    })().catch(() => {});
  }

  // au lancement : ce qui attendait repart (une fois la connexion prête)
  setTimeout(() => flush().catch(() => {}), 15000);
  return { scan, label, flush, isTester };
})();
