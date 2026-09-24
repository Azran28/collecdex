/* Liste de toutes les séries d'un jeu, regroupées par époque, avec ta progression */
App.views.sets = {
  setCard(game, s, p, showBloc = false) {
    const { esc } = App.util;
    const ad = App.games.get(game);
    const sym = ad.img.symbol(s);
    return `
      <a class="set-card ${p.complete ? 'complete' : ''}" href="#/jeu/${game}/serie/${encodeURIComponent(s.id)}" data-set="${esc(s.id)}">
        ${p.complete ? `<span class="badge-complete">${App.icons.icon('trophy', 13)} Complétée</span>` : ''}
        <div class="logo-wrap">${App.ui.setLogo(game, s)}</div>
        <div class="set-title">${sym ? `<img loading="lazy" src="${esc(sym)}" alt="">` : ''}<b>${esc(s.name)}</b></div>
        <div class="set-meta">
          ${App.ui.countHTML(p)}
          <span class="muted small">${p.pct.toLocaleString("fr-FR")} %</span>
        </div>
        ${App.ui.progressBar(p)}
        ${p.byRarity ? App.ui.rarityRow(game, p.byRarity) : ''}
        <div class="set-sub">${showBloc ? esc(s.group.name) + ' · ' : ''}${s.releaseDate ? s.releaseDate.slice(0, 4) : ''}${p.missing && p.have ? ` · ${p.missing} manquante${p.missing > 1 ? 's' : ''}` : ''}</div>
      </a>`;
  },

  async render(el, { game }, alive) {
    const { esc, norm, debounce } = App.util;
    const ad = App.games.get(game);
    if (!ad) { el.innerHTML = `<div class="empty panel">Ce jeu arrive bientôt !</div>`; return; }
    const sets = await ad.listSets();
    if (!alive()) return;

    const S = App.settings;
    const state = { q: '', filter: 'toutes', bloc: '', year: '', sort: S.setsSort || 'recentes', group: S.setsGroup !== false, hidePromo: !!S.setsHidePromo };
    const SORTS = [
      ['recentes', 'Plus récentes d’abord'], ['anciennes', 'Plus anciennes d’abord'], ['nom', 'Nom (A → Z)'],
      ['progression', 'Ma progression (%)'], ['possedees', 'Où j’ai le plus de cartes'], ['proches', 'Les plus proches d’être complétées'],
      ['grandes', 'Les plus grandes séries'], ['petites', 'Les plus petites séries'],
    ];
    const blocs = [...new Map([...sets].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')).map((s) => [s.group.id, s.group.name]))];
    const years = [...new Set(sets.map((s) => (s.releaseDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const isPromo = (s) => /promo|mcdonald|kit d/i.test(s.name);
    const details = {}; // séries dont on connaît les cartes (pour les raretés)

    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › ${esc(ad.name)}</div>
      <div class="row"><h1>Explorer · ${esc(ad.name)}</h1><span class="spacer"></span><span class="muted small">${sets.length} séries · données <a href="${ad.source.url}" target="_blank" rel="noopener">${ad.source.name}</a></span></div>
      <div class="toolbar">
        <input type="search" id="s-q" placeholder="Rechercher une série…" style="min-width:220px">
        <select id="s-sort" title="Trier">${SORTS.map(([k, l]) => `<option value="${k}" ${k === state.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="s-bloc"><option value="">Toutes les époques</option>${blocs.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select>
        <select id="s-year"><option value="">Toutes les années</option>${years.map((y) => `<option>${y}</option>`).join('')}</select>
      </div>
      <div class="row" style="margin:-4px 0 18px">
        <div class="chips" id="s-f">
          ${['toutes', 'entamées', 'complétées', 'non commencées'].map((f) => `<button class="chip ${f === state.filter ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
        </div>
        <span class="spacer"></span>
        <label class="check small"><input type="checkbox" id="s-group" ${state.group ? 'checked' : ''}> Par époque</label>
        <label class="check small"><input type="checkbox" id="s-promo" ${state.hidePromo ? 'checked' : ''}> Masquer les promos</label>
        <span class="muted small" id="s-count"></span>
      </div>
      <div id="s-list"></div>`;

    const list = el.querySelector('#s-list');
    const draw = () => {
      // 1) filtres
      const rows = [];
      for (const s of sets) {
        if (state.q && !norm(s.name + ' ' + s.id + ' ' + s.group.name).includes(norm(state.q))) continue;
        if (state.bloc && s.group.id !== state.bloc) continue;
        if (state.year && !(s.releaseDate || '').startsWith(state.year)) continue;
        if (state.hidePromo && isPromo(s)) continue;
        const p = App.col.progress(game, details[s.id] || s);
        if (state.filter === 'entamées' && !(p.have > 0 && !p.complete)) continue;
        if (state.filter === 'complétées' && !p.complete) continue;
        if (state.filter === 'non commencées' && p.have > 0) continue;
        rows.push({ s, p });
      }
      // 2) tri
      const date = (r) => r.s.releaseDate || '';
      const sorters = {
        recentes: (a, b) => date(b).localeCompare(date(a)),
        anciennes: (a, b) => date(a).localeCompare(date(b)),
        nom: (a, b) => a.s.name.localeCompare(b.s.name, 'fr', { numeric: true }),
        progression: (a, b) => b.p.pct - a.p.pct || b.p.have - a.p.have,
        possedees: (a, b) => b.p.have - a.p.have || b.p.pct - a.p.pct,
        proches: (a, b) => ((a.p.have ? 0 : 1) - (b.p.have ? 0 : 1)) || ((a.p.complete ? 1 : 0) - (b.p.complete ? 1 : 0)) || a.p.missing - b.p.missing,
        grandes: (a, b) => b.p.total - a.p.total,
        petites: (a, b) => a.p.total - b.p.total,
      };
      rows.sort((a, b) => sorters[state.sort](a, b) || date(b).localeCompare(date(a)));
      el.querySelector('#s-count').textContent = `${rows.length} série${rows.length > 1 ? 's' : ''}`;
      if (!rows.length) { list.innerHTML = '<div class="empty panel">Aucune série ne correspond.</div>'; return; }
      // 3) affichage, regroupé par époque (dans l'ordre du tri) ou en une seule grille
      if (!state.group) {
        list.innerHTML = `<div class="grid-auto">${rows.map(({ s, p }) => App.views.sets.setCard(game, s, p, true)).join('')}</div>`;
        return;
      }
      const groups = new Map();
      for (const { s, p } of rows) {
        if (!groups.has(s.group.id)) groups.set(s.group.id, { g: s.group, items: [] });
        groups.get(s.group.id).items.push(App.views.sets.setCard(game, s, p));
      }
      list.innerHTML = [...groups.values()].map(({ g, items }) => `
        <section class="serie-block">
          <div class="serie-head"><span class="era-dot"></span><h2 style="margin:0">${esc(g.name)}</h2><span class="muted small">${items.length} série${items.length > 1 ? 's' : ''}</span></div>
          <div class="grid-auto">${items.join('')}</div>
        </section>`).join('');
    };
    draw();

    el.querySelector('#s-q').addEventListener('input', debounce((e) => { state.q = e.target.value; draw(); }, 200));
    const savePrefs = () => { S.setsSort = state.sort; S.setsGroup = state.group; S.setsHidePromo = state.hidePromo; App.col.saveSettings(); };
    el.querySelector('#s-sort').addEventListener('change', (e) => { state.sort = e.target.value; savePrefs(); draw(); });
    el.querySelector('#s-bloc').addEventListener('change', (e) => { state.bloc = e.target.value; draw(); });
    el.querySelector('#s-year').addEventListener('change', (e) => { state.year = e.target.value; draw(); });
    el.querySelector('#s-group').addEventListener('change', (e) => { state.group = e.target.checked; savePrefs(); draw(); });
    el.querySelector('#s-promo').addEventListener('change', (e) => { state.hidePromo = e.target.checked; savePrefs(); draw(); });
    el.querySelector('#s-f').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      state.filter = b.dataset.f;
      el.querySelectorAll('#s-f .chip').forEach((c) => c.classList.toggle('on', c === b));
      draw();
    });

    // Pour les séries entamées, on charge le détail (raretés) en arrière-plan
    const started = sets.filter((s) => App.col.inSet(game, s.id).length);
    App.util.pool(started, 3, async (s) => {
      const full = await ad.getSet(s.id);
      if (!alive()) return;
      details[s.id] = full;
      const node = list.querySelector(`[data-set="${CSS.escape(s.id)}"]`);
      if (node) node.outerHTML = App.views.sets.setCard(game, s, App.col.progress(game, full), !state.group);
    });
  },
};
