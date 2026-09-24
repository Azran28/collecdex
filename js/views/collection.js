/* Vue globale : toutes tes cartes au même endroit, filtrables et triables */
App.views.collection = {
  async render(el, params, alive) {
    const { esc, euro, norm, debounce } = App.util;
    const state = { q: '', game: '', set: '', rarity: '', flag: 'toutes', sort: params.query.tri || 'ajout' };

    const snapCard = (it) => ({ id: it.id, name: it.snap.name, localId: it.snap.localId, image: it.snap.image, rarity: it.snap.rarity, setId: it.setId, serieId: it.snap.serieId, setName: it.snap.setName });
    const val = (it) => (it.price && it.price.value) || 0;

    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Ma collection</div>
      <div class="row"><h1>Ma collection</h1><span class="spacer"></span>
        <button class="btn sm" id="c-select">☑ Sélectionner</button>
        <button class="btn sm" id="c-prices">↻ Actualiser les prix</button>
        <button class="btn sm" id="c-csv">⬇ Exporter (CSV)</button>
      </div>
      <div class="stats" id="c-stats"></div>
      <div class="toolbar">
        <input type="search" id="c-q" placeholder="Rechercher une carte…">
        <select id="c-game"></select>
        <select id="c-set"></select>
        <select id="c-rar"></select>
        <select id="c-sort">
          <option value="ajout">Tri : derniers ajouts</option>
          <option value="valeur">Tri : plus chères</option>
          <option value="rarete">Tri : plus rares</option>
          <option value="note">Tri : mieux notées</option>
          <option value="nom">Tri : nom</option>
          <option value="serie">Tri : série puis numéro</option>
        </select>
        <div class="chips" id="c-flag">
          ${[['toutes', 'Toutes'], ['favorites', '★ Favorites'], ['photos', '📷 Avec mes photos'], ['doublons', 'Doublons']].map(([k, l]) => `<button class="chip ${k === state.flag ? 'on' : ''}" data-flag="${k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="selbar hidden" id="c-selbar">
        <b id="c-selcount">0 carte sélectionnée</b>
        <button class="btn sm ghost" id="c-selall">Tout sélectionner</button>
        <button class="btn sm ghost" id="c-selnone">Aucune</button>
        <span class="spacer"></span>
        <button class="btn sm danger" id="c-seldel" disabled>🗑 Supprimer</button>
        <button class="btn sm" id="c-selend">Terminer</button>
      </div>
      <div class="cards big" id="c-grid"></div>`;

    el.querySelector('#c-sort').value = state.sort;
    const grid = el.querySelector('#c-grid');

    const fillSelects = () => {
      const items = App.col.all().filter((i) => i.qty > 0);
      const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
      const games = [...new Set(items.map((i) => i.game))];
      el.querySelector('#c-game').innerHTML = opt('', 'Tous les jeux', state.game) + games.map((g) => opt(g, App.games.info(g).name, state.game)).join('');
      const sets = new Map(items.map((i) => [i.setId, i.snap.setName]));
      el.querySelector('#c-set').innerHTML = opt('', 'Toutes les séries', state.set) + [...sets].sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([id, n]) => opt(id, n, state.set)).join('');
      const rars = [...new Set(items.map((i) => i.snap.rarity).filter(Boolean))].sort((a, b) => App.pokemonRarity.rank(b) - App.pokemonRarity.rank(a));
      el.querySelector('#c-rar').innerHTML = opt('', 'Toutes les raretés', state.rarity) + rars.map((r) => opt(r, App.pokemonRarity.label(r), state.rarity)).join('');
    };

    const filtered = () => {
      let items = App.col.all().filter((i) => i.qty > 0);
      if (state.game) items = items.filter((i) => i.game === state.game);
      if (state.set) items = items.filter((i) => i.setId === state.set);
      if (state.rarity) items = items.filter((i) => i.snap.rarity === state.rarity);
      if (state.flag === 'favorites') items = items.filter((i) => i.favorite);
      if (state.flag === 'photos') items = items.filter((i) => i.photos && i.photos.length);
      if (state.flag === 'doublons') items = items.filter((i) => i.qty > 1);
      if (state.q) { const q = norm(state.q); items = items.filter((i) => norm(`${i.snap.name} ${i.snap.setName} ${i.note}`).includes(q)); }
      const rk = (i) => App.games.get(i.game).rarity.rank(i.snap.rarity);
      const s = {
        ajout: (a, b) => b.addedAt - a.addedAt,
        valeur: (a, b) => val(b) - val(a),
        rarete: (a, b) => rk(b) - rk(a) || val(b) - val(a),
        note: (a, b) => (b.rating || 0) - (a.rating || 0) || val(b) - val(a),
        nom: (a, b) => a.snap.name.localeCompare(b.snap.name, 'fr'),
        serie: (a, b) => a.snap.setName.localeCompare(b.snap.setName, 'fr') || App.util.numSort(a.snap.localId, b.snap.localId),
      };
      return items.sort(s[state.sort]);
    };

    const draw = () => {
      const all = App.col.all().filter((i) => i.qty > 0);
      const items = filtered();
      const total = all.reduce((s, i) => s + (i.price && i.price.unit === 'EUR' ? val(i) * i.qty : 0), 0);
      const shownVal = items.reduce((s, i) => s + (i.price && i.price.unit === 'EUR' ? val(i) * i.qty : 0), 0);
      el.querySelector('#c-stats').innerHTML = `
        <div class="stat"><b>${all.length}</b><span>cartes différentes</span></div>
        <div class="stat"><b>${all.reduce((s, i) => s + i.qty, 0)}</b><span>exemplaires</span></div>
        <div class="stat"><b>${euro(total)}</b><span>valeur totale estimée</span></div>
        <div class="stat"><b>${all.filter((i) => i.favorite).length}</b><span>favorites</span></div>
        ${items.length !== all.length ? `<div class="stat"><b>${items.length}</b><span>affichées · ${euro(shownVal)}</span></div>` : ''}`;
      grid.innerHTML = items.length
        ? items.map((it) => App.ui.cardTile(snapCard(it), { game: it.game, item: it, showSet: true, quickAdd: false })).join('')
        : `<div class="empty panel" style="grid-column:1/-1">${all.length ? 'Aucune carte ne correspond à ces filtres.' : 'Ta collection est vide. <a href="#/scan">Scanne une carte</a> pour l’ajouter.'}</div>`;
      App.ui.hydratePhotos(grid);
      if (selecting) paintSelection();
    };

    // ---------- Mode sélection : supprimer plusieurs cartes d'un coup ----------
    let selecting = false;
    const selected = new Set();
    const paintSelection = () => {
      grid.classList.toggle('selecting', selecting);
      grid.querySelectorAll('.ctile').forEach((t) => t.classList.toggle('picked', selected.has(`${t.dataset.game}:${t.dataset.card}`)));
      el.querySelector('#c-selcount').textContent = `${selected.size} carte${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''}`;
      el.querySelector('#c-seldel').disabled = !selected.size;
    };
    const setSelecting = (on) => {
      selecting = on; selected.clear();
      el.querySelector('#c-selbar').classList.toggle('hidden', !on);
      el.querySelector('#c-select').classList.toggle('primary', on);
      paintSelection();
    };
    el.querySelector('#c-select').addEventListener('click', () => setSelecting(!selecting));
    el.querySelector('#c-selend').addEventListener('click', () => setSelecting(false));
    el.querySelector('#c-selall').addEventListener('click', () => { filtered().forEach((i) => selected.add(i.key)); paintSelection(); });
    el.querySelector('#c-selnone').addEventListener('click', () => { selected.clear(); paintSelection(); });
    el.querySelector('#c-seldel').addEventListener('click', async () => {
      const n = selected.size; if (!n) return;
      if (!confirm(`Supprimer ${n} carte${n > 1 ? 's' : ''} de ta collection ?\n\nLeurs photos et exemplaires seront supprimés. (Tu pourras les rescanner plus tard.)`)) return;
      for (const k of [...selected]) await App.col.remove(k);
      App.util.toast(`${n} carte${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`);
      setSelecting(false);
    });

    fillSelects(); draw();

    el.querySelector('#c-q').addEventListener('input', debounce((e) => { state.q = e.target.value; draw(); }, 200));
    for (const [id, k] of [['#c-game', 'game'], ['#c-set', 'set'], ['#c-rar', 'rarity'], ['#c-sort', 'sort']]) {
      el.querySelector(id).addEventListener('change', (e) => { state[k] = e.target.value; draw(); });
    }
    el.querySelector('#c-flag').addEventListener('click', (e) => {
      const b = e.target.closest('[data-flag]'); if (!b) return;
      state.flag = b.dataset.flag;
      el.querySelectorAll('#c-flag .chip').forEach((c) => c.classList.toggle('on', c === b));
      draw();
    });
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.ctile'); if (!t) return;
      if (selecting) {
        const k = `${t.dataset.game}:${t.dataset.card}`;
        selected.has(k) ? selected.delete(k) : selected.add(k);
        return paintSelection();
      }
      App.cardModal(t.dataset.game, t.dataset.card, { list: filtered().map((i) => i.id) });
    });
    el.querySelector('#c-prices').addEventListener('click', () => App.col.refreshPrices(App.col.all().map((i) => i.key)));
    el.querySelector('#c-csv').addEventListener('click', () => {
      const rows = [['Jeu', 'Série', 'Numéro', 'Nom', 'Rareté', 'Quantité', 'Versions', 'Favorite', 'Note', 'Prix unitaire', 'Devise', 'Commentaire']];
      for (const it of filtered()) rows.push([App.games.info(it.game).name, it.snap.setName, it.snap.localId, it.snap.name, App.pokemonRarity.label(it.snap.rarity), it.qty, it.variants.join(' '), it.favorite ? 'oui' : '', it.rating || '', it.price && it.price.value != null ? String(it.price.value).replace('.', ',') : '', it.price ? it.price.unit || '' : '', it.note || '']);
      const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `ma-collection-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });

    const unsub = App.col.on(() => { fillSelects(); draw(); });
    return unsub;
  },
};
