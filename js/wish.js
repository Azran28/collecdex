/*
 * Liste de souhaits (cartes recherchées) et objectifs personnels (finir une série, avec date facultative).
 * Rangés dans le profil : ils suivent le compte d'un appareil à l'autre.
 *   profile.wishlist = [{ game, id, name, localId, image, rarity, setId, setName, serieId, addedAt }]
 *   profile.goals    = [{ id, game, setId, setName, deadline: 'AAAA-MM-JJ' | null, createdAt }]
 */
App.wish = (() => {
  let wished = new Set(); // clés « jeu:id » (lecture instantanée pour les tuiles)
  let goalSets = new Set();
  let favSets = new Set();
  const key = (game, id) => `${game}:${id}`;

  async function load() {
    const p = await App.col.getProfile().catch(() => ({}));
    wished = new Set((p.wishlist || []).map((w) => key(w.game, w.id)));
    goalSets = new Set((p.goals || []).map((g) => key(g.game, g.setId)));
    favSets = new Set((p.favSets || []).map((f) => key(f.game, f.id)));
  }
  async function edit(fn) {
    const p = await App.col.getProfile();
    p.wishlist = p.wishlist || []; p.goals = p.goals || []; p.favSets = p.favSets || [];
    fn(p);
    await App.col.saveProfile(p);
    await load();
    App.col.notify();
    return p;
  }

  // ---------- Liste de souhaits ----------
  const has = (game, id) => wished.has(key(game, id));
  async function list() { return ((await App.col.getProfile()).wishlist || []); }
  /** Ajoute / retire une carte de la liste de souhaits ; renvoie le nouvel état */
  async function toggle(game, card, setInfo = {}) {
    const on = !has(game, card.id);
    await edit((p) => {
      p.wishlist = p.wishlist.filter((w) => !(w.game === game && w.id === card.id));
      if (on) {
        p.wishlist.unshift({
          game, id: card.id, name: card.name, localId: card.localId, image: card.image || '', rarity: card.rarity || '',
          setId: card.setId || (card.set && card.set.id) || setInfo.id || '', setName: (card.set && card.set.name) || setInfo.name || card.setName || '',
          serieId: card.serieId || (setInfo.group && setInfo.group.id) || '', addedAt: Date.now(),
        });
      }
    });
    App.util.toast(on ? `♥ ${card.name} ajoutée à ta liste de souhaits` : `${card.name} retirée de ta liste de souhaits`);
    return on;
  }
  /** Cartes de la liste désormais possédées : on les retire (une fois capturées, elles ne sont plus « cherchées ») */
  async function prune() {
    const l = await list();
    const got = l.filter((w) => App.col.owned(w.game, w.id));
    if (got.length) await edit((p) => { p.wishlist = p.wishlist.filter((w) => !App.col.owned(w.game, w.id)); });
    return got;
  }

  // ---------- Objectifs ----------
  const isGoal = (game, setId) => goalSets.has(key(game, setId));
  async function goals() { return ((await App.col.getProfile()).goals || []); }
  async function addGoal(game, set, deadline = null) {
    await edit((p) => {
      p.goals = p.goals.filter((g) => !(g.game === game && g.setId === set.id));
      p.goals.push({ id: 'g' + Date.now().toString(36), game, setId: set.id, setName: set.name, deadline: deadline || null, createdAt: Date.now() });
    });
  }
  async function setDeadline(goalId, deadline) { await edit((p) => { const g = p.goals.find((x) => x.id === goalId); if (g) g.deadline = deadline || null; }); }
  async function removeGoal(goalId) { await edit((p) => { p.goals = p.goals.filter((g) => g.id !== goalId); }); }

  // ---------- Séries favorites ----------
  const isFavSet = (game, setId) => favSets.has(key(game, setId));
  async function toggleSet(game, setId, name = '') {
    const on = !isFavSet(game, setId);
    await edit((p) => {
      p.favSets = p.favSets.filter((f) => !(f.game === game && f.id === setId));
      if (on) p.favSets.unshift({ game, id: setId, name, addedAt: Date.now() });
    });
    App.util.toast(on ? `★ ${name || 'Série'} ajoutée à tes séries favorites` : `${name || 'Série'} retirée de tes favorites`);
    return on;
  }

  /** Jours restants avant la date (négatif si dépassée), ou null */
  const daysLeft = (d) => (d ? Math.ceil((new Date(d + 'T23:59:59') - Date.now()) / 86400000) : null);

  return { load, has, list, toggle, prune, isFavSet, toggleSet, isGoal, goals, addGoal, setDeadline, removeGoal, daysLeft };
})();
