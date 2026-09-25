/* Page d'accueil : chiffres clés, licences disponibles, séries en cours, derniers ajouts */
App.views.home = {
  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const items = App.col.all().filter((i) => i.qty > 0);
    const copies = items.reduce((s, i) => s + i.qty, 0);
    const value = items.reduce((s, i) => s + (i.price && i.price.value && i.price.unit === 'EUR' ? i.price.value * i.qty : 0), 0);

    el.innerHTML = `
      <section class="hero">
        <h1>Ton <span class="holo">Dex</span> de collection</h1>
        <p class="muted">Capture tes cartes, complète tes séries, montre tes pépites.</p>
        <div class="stats">
          <div class="stat"><b>${items.length}</b><span>cartes</span></div>
          <div class="stat"><b>${copies - items.length}</b><span>doublons</span></div>
          <div class="stat"><b>${euro(value)}</b><span>valeur estimée</span></div>
          <div class="stat" id="h-complete"><b>…</b><span>séries complètes</span></div>
        </div>
        <div class="row" style="margin-top:14px">
          <a class="btn primary" href="#/scan">${App.icons.icon('capture', 16)} Capturer une carte</a>
          <a class="btn" href="#/jeu/pokemon">${App.icons.icon('explore', 16)} Explorer</a>
          <a class="btn" href="#/vitrine">${App.icons.icon('trophy', 16)} Ma vitrine</a>
        </div>
      </section>

      <div class="section-title"><h2>Licences</h2></div>
      <div class="grid-auto licences">
        ${App.games.list.map((g) => {
          const on = g.status === 'actif';
          const n = items.filter((i) => i.game === g.id).length;
          return `
          <a class="game-tile g-${g.id} ${on ? '' : 'soon'}" href="${on ? `#/jeu/${g.id}` : '#/'}">
            <div class="gicon">${App.icons.icon(g.icon, 26)}</div>
            <div class="gtxt">
              <h3>${esc(g.name)}</h3>
              <div class="muted small">${on ? `<b style="color:var(--text)">${n}</b> carte${n > 1 ? 's' : ''} · ` : ''}${esc(g.desc)}</div>
            </div>
            <span class="pill tag">${on ? 'dispo' : esc(g.status)}</span>
          </a>`;
        }).join('')}
      </div>

      <div id="h-goals"></div>
      <div id="h-inprogress"></div>

      <div class="section-title"><h2>Derniers ajouts</h2><span class="spacer"></span>${items.length ? '<a href="#/collection">Tout voir ›</a>' : ''}</div>
      <div id="h-recent">${items.length ? '' : '<div class="empty panel">Ton Dex est vide pour l’instant.<br>Capture ta première carte pour commencer !</div>'}</div>
    `;

    // Derniers ajouts (redessinés dès qu'une carte change : photo, visuel, quantité…)
    const r = el.querySelector('#h-recent');
    const drawRecent = () => {
      const recent = App.col.all().filter((i) => i.qty > 0).sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
      if (!recent.length) return;
      r.innerHTML = `<div class="cards">${recent.map((it) => App.ui.cardTile({ id: it.id, name: it.snap.name, localId: it.snap.localId, image: it.snap.image, rarity: it.snap.rarity, setId: it.setId, serieId: it.snap.serieId, setName: it.snap.setName }, { game: it.game, item: it, showSet: true, quickAdd: false })).join('')}</div>`;
      App.ui.hydratePhotos(r);
    };
    drawRecent();
    r.addEventListener('click', (e) => { const t = e.target.closest('.ctile'); if (t) App.cardModal(t.dataset.game, t.dataset.card); });
    const unsub = App.col.on(App.util.debounce(() => { if (alive()) drawRecent(); }, 300));

    // Séries en cours + séries complétées
    try {
      const ad = App.games.get('pokemon');
      const sets = await ad.listSets();
      if (!alive()) return unsub;
      // Objectifs + liste de souhaits
      const gs = await App.wish.goals();
      const wl = (await App.wish.list()).filter((w) => !App.col.owned(w.game, w.id));
      const hg = el.querySelector('#h-goals');
      const ad0 = App.games.get('pokemon');
      const wishTile = wl.length ? `<a class="home-goal home-wish" href="#/objectifs?tab=souhaits">
          <div class="row" style="gap:8px"><b>${App.icons.icon('heart', 15)} Liste de souhaits</b><span class="spacer"></span><span class="small muted">${wl.length} carte${wl.length > 1 ? 's' : ''}</span></div>
          <div class="hw-thumbs">${wl.slice(0, 5).map((w) => `<img src="${esc(ad0.img.card({ image: w.image, id: w.id, setId: w.setId, localId: w.localId, serieId: w.serieId }, 'low'))}" alt="${esc(w.name)}" title="${esc(w.name)}" loading="lazy" data-alt="">`).join('')}${wl.length > 5 ? `<span class="hw-more">+${wl.length - 5}</span>` : ''}</div>
        </a>` : '';
      if (gs.length || wl.length) {
        const rows = gs.map((g) => ({ g, s: sets.find((x) => x.id === g.setId) })).filter((x) => x.s).slice(0, wl.length ? 2 : 3);
        hg.innerHTML = `<div class="section-title"><h2>Mes objectifs</h2><span class="spacer"></span><a href="#/objectifs">Tout voir ›</a></div>
          <div class="home-goals">${rows.map(({ g, s }) => {
            const p = App.col.progress('pokemon', s), left = App.wish.daysLeft(g.deadline);
            return `<a class="home-goal ${p.complete ? 'done' : ''}" href="#/objectifs?tab=manque&set=${encodeURIComponent(s.id)}">
              <div class="row" style="gap:8px"><b>${esc(s.name)}</b><span class="spacer"></span>${p.complete ? App.icons.icon('trophy', 15) : g.deadline ? `<span class="small ${left < 0 ? 'late' : ''}">${left < 0 ? 'dépassé' : 'J-' + left}</span>` : ''}</div>
              <div class="row small muted" style="gap:6px;margin:4px 0">${p.have}/${p.total} · ${p.pct.toLocaleString('fr-FR')} %${p.complete ? '' : ` · ${p.missing} à trouver`}</div>
              ${App.ui.progressBar(p)}
            </a>`;
          }).join('')}${wishTile}${!gs.length ? `<a class="home-goal goal-cta-mini" href="#/objectifs">${App.icons.icon('target', 18)}<span><b>Fixe-toi un objectif</b><br><span class="small muted">Une série à compléter, avec une date.</span></span></a>` : ''}</div>`;
      } else if (items.length) {
        hg.innerHTML = `<a class="goal-cta" href="#/objectifs">${App.icons.icon('target', 20)}<span><b>Fixe-toi un objectif</b><br><span class="small muted">Choisis une série à compléter, et vois les cartes qu’il te manque, les moins chères d’abord.</span></span></a>`;
      }
      const bySet = {};
      for (const it of items.filter((i) => i.game === 'pokemon')) { bySet[it.setId] = Math.max(bySet[it.setId] || 0, it.addedAt); }
      const started = sets.filter((s) => bySet[s.id]).map((s) => ({ s, p: App.col.progress('pokemon', s), t: bySet[s.id] }));
      el.querySelector('#h-complete b').textContent = started.filter((x) => x.p.complete).length;
      if (started.length) {
        started.sort((a, b) => b.t - a.t);
        el.querySelector('#h-inprogress').innerHTML = `<div class="section-title"><h2>Mes séries en cours</h2></div><div class="grid-auto">${started.slice(0, 6).map(({ s, p }) => App.views.sets.setCard('pokemon', s, p)).join('')}</div>`;
      }
    } catch (e) {
      el.querySelector('#h-complete b').textContent = '—';
    }
    return unsub;
  },
};
