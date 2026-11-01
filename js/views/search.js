/*
 * Recherche dans toutes les cartes d'une licence (#/jeu/<licence>/recherche?q=Pikachu, v4.12, Arnaud : « ok la recherche par
 * Pokémon / nom ») : toutes les cartes de ce nom, toutes séries confondues (le « Dex par Pokémon »), possédées et manquantes,
 * avec ta progression. S'appuie sur `ad.search({ name })` de chaque licence (celle du scanner). Entrée : Explorer › recherche.
 */
App.views.search = {
  async render(el, { game, query }) {
    const { esc, norm, debounce } = App.util;
    const ad = App.games.get(game);
    if (!ad || ad.perso || !ad.search) { location.hash = '#/jeu/' + (game || 'pokemon'); return; }
    const who = game === 'pokemon' ? 'Pokémon' : 'personnage';
    const st = { q: (query.q || '').trim(), f: 'toutes', cards: [], busy: false };
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/jeu/${esc(game)}">${esc(ad.name)}</a> › Recherche</div>
      <h1>Toutes les cartes d’un ${who}</h1>
      <div class="toolbar"><input type="search" id="q-in" placeholder="${game === 'pokemon' ? 'ex. Pikachu, Dracaufeu…' : 'Nom de la carte'}" value="${esc(st.q)}" enterkeyhint="search" style="min-width:240px;flex:1"></div>
      <div class="chips" id="q-f" style="margin:10px 0"></div>
      <div id="q-res"></div>`;
    const res = el.querySelector('#q-res'), chips = el.querySelector('#q-f'), input = el.querySelector('#q-in');
    const date = (c) => (c.set && (c.set.releaseDate || c.set.sortKey)) || c.releaseDate || '9999'; // (hors-série, sans date : à la fin)
    const setName = (c) => c.setName || (c.set && c.set.name) || '';

    const draw = () => {
      if (!st.q || st.q.length < 2) { chips.innerHTML = ''; res.innerHTML = `<div class="empty panel small muted">Écris au moins 2 lettres : toutes les cartes de ce nom, de toutes les séries, s’affichent ici.</div>`; return; }
      if (st.busy) { chips.innerHTML = ''; res.innerHTML = App.ui.loading(`Je cherche « ${st.q} »…`); return; }
      const all = st.cards, own = all.filter((c) => App.col.owned(game, c.id));
      chips.innerHTML = all.length ? [['toutes', `Toutes · ${all.length}`], ['possedees', `Possédées · ${own.length}`], ['manquantes', `Manquantes · ${all.length - own.length}`]]
        .map(([k, l]) => `<button class="chip ${k === st.f ? 'on' : ''}" data-f="${k}">${l}</button>`).join('') : '';
      const list = st.f === 'possedees' ? own : st.f === 'manquantes' ? all.filter((c) => !App.col.owned(game, c.id)) : all;
      if (!all.length) { res.innerHTML = `<div class="empty panel">Aucune carte « ${esc(st.q)} » dans ${esc(ad.name)}.</div>`; return; }
      const pct = Math.round(own.length * 100 / all.length);
      res.innerHTML = `<div class="small muted" style="margin:4px 0 6px">Tu en as <b>${own.length}</b> sur ${all.length}</div><div style="margin-bottom:12px">${App.ui.progressBar({ pct, complete: own.length === all.length })}</div>
        <div class="cards">${list.map((c) => App.ui.cardTile({ ...c, setName: setName(c) }, { game, showSet: true, showPrice: false })).join('') || '<div class="empty panel small muted">Rien ici.</div>'}</div>`;
      App.ui.hydratePhotos && App.ui.hydratePhotos(el);
    };

    let token = 0;
    const run = async () => {
      const q = st.q, my = ++token;
      history.replaceState(history.state, '', `#/jeu/${game}/recherche${q ? '?q=' + encodeURIComponent(q) : ''}`);
      if (q.length < 2) { st.cards = []; draw(); return; }
      st.busy = true; draw();
      let cards = [];
      try { cards = await ad.search({ name: q }); } catch (e) { cards = []; }
      if (my !== token) return;
      // une carte par id (Pokémon : français + séries anglaises), le nom cherché d'abord, puis de la plus ancienne à la plus récente
      const seen = new Set(), n = norm(q);
      st.cards = (cards || []).filter((c) => c && c.id && !seen.has(c.id) && seen.add(c.id))
        .sort((a, b) => (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1) || date(a).localeCompare(date(b)) || String(a.localId).localeCompare(String(b.localId), 'fr', { numeric: true }));
      st.busy = false; st.f = 'toutes'; draw();
    };
    input.addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); run(); }, 450));
    chips.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { st.f = b.dataset.f; draw(); } });
    res.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const t = e.target.closest('.ctile');
      if (t) App.cardModal(game, t.dataset.card, { list: st.cards.map((c) => c.id) });
    });
    run();
    if (!st.q) setTimeout(() => input.focus(), 50);
    const off = App.col.on(draw);
    return () => { token++; off(); };
  },
};
