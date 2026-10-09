/* Page « Combat » — choix des Pokémon / personnages d'une équipe et de son sac. Partie de match.js (voir match-core.js). */
(() => {
  const { esc, B, ad, adOf, BAG_MAX, lic, say, sideOf, teamItems, bagItems, myTrainers, myPokemon, typeColor, typesOf, typeName } = App.matchParts;

  // ---------- Choix des Pokémon d'une équipe ----------
  /** Statistiques de combat d'une carte (d'après la fiche détaillée TCGdex, gardée en cache) */
  async function combatStats(it) {
    const game = it.game || 'pokemon', card = await adOf(it).getCard(it.id);
    if (game === 'onepiece' ? !B().isOpFighter(card) : (!/pok/i.test(card.category || 'Pokémon') || !card.hp)) return { invalid: true };
    const f = B().fighterOf(card, game);
    const dmg = (a) => (a.noDamage ? 10 : a.mode === 'x' ? a.base * 2 : a.base);
    return {
      hp: f.hp, type: f.type,
      maxDmg: Math.max(...f.attacks.map(dmg)),
      minCost: Math.min(...f.attacks.map((a) => a.cost)),
      power: B().power(f),
      weak: f.weak.map((w) => w.type),
    };
  }

  const SORTS = [
    ['power', 'Plus fort'], ['hp', 'Plus de PV'], ['dmg', 'Plus gros dégâts'], ['fast', 'Attaque la moins chère'], ['name', 'Nom'],
  ];
  const HP_MIN = [0, 60, 80, 100, 120, 150, 200];

  async function pickTeam(current, name, game = 'pokemon') {
    let body = App.util.openModal(App.ui.loading('Recherche de tes combattants…'));
    const items = await myPokemon(game);
    const imgs = await Promise.all(items.map((it) => App.col.displayImage(it, adOf(it))));
    // statistiques : d'abord celles de la liste de la série (PV, type), puis la fiche complète (attaques)
    const rows = items.map((it, i) => ({ it, img: imgs[i].src, name: it.snap.name || '', hp: it._hp || null, type: it._type || null, maxDmg: null, minCost: null, power: null, weak: [], full: false }));
    const sel = current.filter((k) => rows.some((r) => r.it.key === k)).slice(0, 3);
    const F = { q: '', types: new Set(), sort: 'power', hp: 0, cost: 0 };

    return new Promise((resolve) => {
      let done = false, loaded = 0;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      body = App.util.openModal('', () => end(null));
      if (!rows.length) {
        body.innerHTML = `<div class="bt-pick"><h2>${esc(name)}</h2><p class="muted">${esc(say(game, 'Tu n’as pas encore de Pokémon dans ton Dex : tu joueras avec des Pokémon de prêt. Capture tes cartes pour jouer avec elles !'))}</p>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="bt-ok">OK</button></div></div>`;
        body.querySelector('#bt-ok').addEventListener('click', () => { end([...current]); App.util.closeModal(); });
        return;
      }
      body.innerHTML = `<div class="bt-pick"><h2>${esc(name)} <span class="muted small" id="bt-cnt"></span></h2>
        <div class="bt-sel" id="bt-sel"></div>
        <div class="bt-filters">
          <input type="search" id="bt-q" placeholder="${esc(lic(game).search)}" autocomplete="off">
          <div class="bt-ftypes" id="bt-ftypes"></div>
          <div class="bt-frow">
            <label>Trier<select id="bt-sort">${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
            <label>PV<select id="bt-hp">${HP_MIN.map((v) => `<option value="${v}">${v ? v + ' et +' : 'Tous'}</option>`).join('')}</select></label>
            <label>Énergie<select id="bt-cost"><option value="0">Toutes</option><option value="1">Attaque à 1 énergie</option><option value="2">Attaque à 2 énergies max</option><option value="3">Attaque à 3 énergies max</option></select></label>
          </div>
          <div class="bt-fstate small muted" id="bt-fstate"></div>
        </div>
        <div class="bt-pick-grid" id="bt-grid">${rows.map((r, i) => `<button class="bt-pk" data-i="${i}" data-k="${esc(r.it.key)}"><span class="n" hidden></span><img src="${esc(r.img)}" alt="" loading="lazy" data-alt="${esc(r.name)}"><span class="bt-pk-n">${esc(r.name)}</span><span class="bt-pk-s"></span></button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn ghost" id="bt-clear">Vider</button><button class="btn primary" id="bt-ok">Valider</button></div></div>`;
      const $ = (s) => body.querySelector(s);
      const tiles = [...body.querySelectorAll('.bt-pk')];

      const statsHtml = (r) => `${r.type ? `<i class="bt-dot" style="--tc:${typeColor(r.type)}" title="${esc(typeName(r.type, game))}"></i>` : ''}<b>${r.hp ? r.hp + ' PV' : '…'}</b>${r.maxDmg != null ? `<em title="Plus grosse attaque">⚔ ${r.maxDmg}</em>` : ''}`;
      const drawTile = (i) => { tiles[i].querySelector('.bt-pk-s').innerHTML = statsHtml(rows[i]); };
      rows.forEach((r, i) => drawTile(i));

      const drawTypes = () => {
        // les 11 types du jeu de cartes, toujours affichés (grisés si tu n'en as aucun)
        const cnt = {}; rows.forEach((r) => { if (r.type && !r.invalid) cnt[r.type] = (cnt[r.type] || 0) + 1; });
        $('#bt-ftypes').innerHTML = `<button class="bt-tchip ${F.types.size ? '' : 'on'}" data-t="">${game === 'onepiece' ? 'Toutes les couleurs' : 'Tous les types'}</button>` + typesOf(game).map((t) => `<button class="bt-tchip ${F.types.has(t) ? 'on' : ''} ${cnt[t] ? '' : 'none'}" data-t="${t}" style="--tc:${typeColor(t)}" ${cnt[t] ? '' : `disabled title="${say(game, 'Aucun Pokémon de ce type dans ta collection')}"`}><i></i>${esc(typeName(t, game))}${cnt[t] ? ` <small>${cnt[t]}</small>` : ''}</button>`).join('');
      };
      drawTypes();

      const drawSel = () => {
        $('#bt-sel').innerHTML = [0, 1, 2].map((j) => { const r = rows.find((x) => x.it.key === sel[j]); return r
          ? `<button class="bt-sel-s" data-rm="${esc(r.it.key)}" title="Retirer"><img src="${esc(r.img)}" alt=""><span>${j + 1}. ${esc(r.name)}</span><b>×</b></button>`
          : `<span class="bt-sel-s empty"><i>${j + 1}</i><span>${j === 0 ? 'Commence le combat' : 'Banc'}</span></span>`; }).join('');
        $('#bt-cnt').textContent = `${sel.length}/3`;
      };

      const key = (r) => {
        switch (F.sort) {
          case 'hp': return -(r.hp || 0);
          case 'dmg': return -(r.maxDmg == null ? -1 : r.maxDmg);
          case 'fast': return r.minCost == null ? 99 : r.minCost * 1000 - (r.maxDmg || 0);
          case 'name': return 0;
          default: return -(r.power == null ? (r.hp || 0) : r.power);
        }
      };
      const apply = () => {
        const v = App.util.norm(F.q);
        const grid = $('#bt-grid');
        const order = rows.map((r, i) => i).sort((a, b) => (key(rows[a]) - key(rows[b])) || rows[a].name.localeCompare(rows[b].name, 'fr'));
        let shown = 0;
        for (const i of order) {
          const r = rows[i], t = tiles[i];
          const ok = (!v || App.util.norm(r.name).includes(v))
            && (!F.types.size || (r.type && F.types.has(r.type)))
            && (!F.hp || (r.hp || 0) >= F.hp)
            && (!F.cost || (r.minCost != null && r.minCost <= F.cost))
            && !r.invalid;
          t.hidden = !ok; if (ok) shown++;
          const n = sel.indexOf(r.it.key);
          t.classList.toggle('on', n >= 0);
          const badge = t.querySelector('.n'); badge.hidden = n < 0; badge.textContent = n + 1;
          grid.appendChild(t); // ordre de tri
        }
        const waiting = loaded < rows.length;
        $('#bt-fstate').textContent = say(game, `${shown} Pokémon sur ${rows.filter((r) => !r.invalid).length}`)
          + (waiting ? ` · lecture des attaques ${loaded}/${rows.length}…` : '')
          + (!shown ? ' — aucun ne correspond à ces filtres' : '');
        drawSel();
      };
      apply();

      // fiches complètes, petit à petit (gardées en cache ensuite)
      let pending = null;
      const later = () => { if (!pending) pending = setTimeout(() => { pending = null; if (!done) apply(); }, 500); };
      App.util.pool(rows.map((r, i) => i), 6, async (i) => {
        if (done) return;
        try { Object.assign(rows[i], await combatStats(rows[i].it), { full: true }); } catch (e) { /* hors ligne : on garde PV et type de la série */ }
        loaded++;
        if (done) return;
        if (rows[i].invalid) tiles[i].hidden = true; else drawTile(i);
        later();
      }).then(() => { if (!done) { drawTypes(); apply(); } });

      body.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { const i = sel.indexOf(rm.dataset.rm); if (i >= 0) sel.splice(i, 1); apply(); return; }
        const tc = e.target.closest('[data-t]');
        if (tc) { const t = tc.dataset.t; if (!t) F.types.clear(); else if (F.types.has(t)) F.types.delete(t); else F.types.add(t); drawTypes(); apply(); return; }
        const k = e.target.closest('.bt-pk');
        if (k) { const kk = k.dataset.k; const i = sel.indexOf(kk); if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(kk); else App.util.toast('3 cartes maximum : retire-en un d’abord'); apply(); return; }
        if (e.target.closest('#bt-clear')) { sel.length = 0; apply(); return; }
        if (e.target.closest('#bt-ok')) { end([...sel]); App.util.closeModal(); }
      });
      body.addEventListener('input', (e) => { if (e.target.id === 'bt-q') { F.q = e.target.value; apply(); } });
      body.addEventListener('change', (e) => {
        if (e.target.id === 'bt-sort') F.sort = e.target.value;
        else if (e.target.id === 'bt-hp') F.hp = +e.target.value;
        else if (e.target.id === 'bt-cost') F.cost = +e.target.value;
        else return;
        apply();
      });
    });
  }

  /** Choisir la pioche (cartes Dresseur / Énergie) d'une équipe */
  async function pickBag(current, name, game = 'pokemon') {
    let body = App.util.openModal(App.ui.loading(`Recherche de tes cartes ${lic(game).bagKinds}…`));
    const list = await myTrainers(game);
    const imgs = await Promise.all(list.map((it) => App.col.displayImage(it, adOf(it))));
    const sel = bagItems(current).map((i) => i.key).slice(0, BAG_MAX);
    const fx = {};
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      body = App.util.openModal('', () => end(null));
      const kinds = lic(game).bagKinds, loanTxt = game === 'onepiece' ? 'Sans carte, tu joues avec une pioche de prêt de 8 cartes : 2 Guard Point, Four Thousand-Brick Fist, You Can Be My Samurai!!, Sables et 3 DON!!.'
        : 'Sans carte, tu joues avec une pioche de prêt de 8 cartes : 2 Potion, PlusPower, Défenseur, Transfert et 3 Énergies du type de ton 1er Pokémon.';
      if (!list.length) {
        body.innerHTML = `<div class="bt-pick"><h2>Pioche · ${esc(name)}</h2><p class="muted">Tu n’as pas encore de carte ${esc(kinds)} dans ton Dex. ${loanTxt} Capture-les pour les utiliser !</p>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="bt-ok">OK</button></div></div>`;
        body.querySelector('#bt-ok').addEventListener('click', () => { end(null); App.util.closeModal(); });
        return;
      }
      body.innerHTML = `<div class="bt-pick"><h2>Pioche · ${esc(name)} <span class="muted small" id="bt-cnt"></span></h2>
        <p class="small muted" style="margin:4px 0 0">Jusqu’à ${BAG_MAX} cartes ${esc(kinds)}${game === 'onepiece' ? ' ; 3 cartes DON!! s’y ajoutent toutes seules (jusqu’à 10 cartes en tout)' : ''}. En combat Avancé, elles sont mélangées : tu commences avec 3 cartes en main et tu en pioches 1 à chaque tour ; tu peux en jouer une par tour. Touche une carte plusieurs fois pour en mettre plusieurs exemplaires (si tu les as). ${loanTxt}</p>
        <div class="bt-sel bag" id="bt-sel"></div>
        <input type="search" id="bt-q" placeholder="Rechercher une carte…" autocomplete="off">
        <div class="bt-pick-grid bag" id="bt-grid">${list.map((it, i) => `<button class="bt-pk" data-k="${esc(it.key)}" data-q="${esc(App.util.norm(it.snap.name || ''))}"><span class="n" hidden></span><img src="${esc(imgs[i].src)}" alt="" loading="lazy" data-alt="${esc(it.snap.name)}"><span class="bt-pk-n">${esc(it.snap.name)}</span><span class="bt-pk-s"><em>…</em></span>${it.qty > 1 ? `<span class="bt-qty">×${it.qty}</span>` : ''}</button>`).join('')}</div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn ghost" id="bt-clear">Vider</button><button class="btn primary" id="bt-ok">Valider</button></div></div>`;
      const $ = (q) => body.querySelector(q);
      const byKey = Object.fromEntries(list.map((it, i) => [it.key, { it, img: imgs[i].src }]));
      const tile = (k) => body.querySelector(`.bt-pk[data-k="${CSS.escape(k)}"]`);
      const draw = () => {
        $('#bt-sel').innerHTML = Array.from({ length: BAG_MAX }, (_, j) => { const k = sel[j]; const r = k && byKey[k]; return r
          ? `<button class="bt-sel-s" data-rm="${j}" title="${esc(fx[k] ? fx[k].desc : '')}"><img src="${esc(r.img)}" alt=""><span>${esc(r.it.snap.name)}</span><b>×</b></button>`
          : '<span class="bt-sel-s empty"><i>+</i></span>'; }).join('');
        $('#bt-cnt').textContent = `${sel.length}/${BAG_MAX}`;
        body.querySelectorAll('.bt-pk').forEach((t) => { const n = sel.filter((k) => k === t.dataset.k).length; t.classList.toggle('on', n > 0); const b = t.querySelector('.n'); b.hidden = !n; b.textContent = n > 1 ? '×' + n : '✓'; });
      };
      draw();
      // effet de chaque carte (fiche TCGdex, gardée en cache)
      App.util.pool(list, 6, async (it) => {
        try { const card = await ad(game).getCard(it.id); const e = App.battleCards.effectOf(card); fx[it.key] = { ...e, short: say(game, e.short), desc: say(game, e.desc) }; } catch (e) { return; }
        if (done) return;
        const t = tile(it.key); if (t) { t.querySelector('.bt-pk-s').innerHTML = `<em>${esc(fx[it.key].short)}</em>`; t.title = fx[it.key].desc; }
      });
      body.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { sel.splice(+rm.dataset.rm, 1); draw(); return; }
        const k = e.target.closest('.bt-pk');
        if (k) {
          const key = k.dataset.k, it = byKey[key].it, n = sel.filter((x) => x === key).length;
          if (sel.length >= BAG_MAX) App.util.toast(`${BAG_MAX} cartes maximum : retire-en une d’abord`);
          else if (n >= it.qty) { App.util.toast(n > 1 ? `Tu n’as que ${it.qty} exemplaires` : 'Tu n’as qu’un exemplaire de cette carte'); }
          else sel.push(key);
          draw(); return;
        }
        if (e.target.closest('#bt-clear')) { sel.length = 0; draw(); return; }
        if (e.target.closest('#bt-ok')) { end([...sel]); App.util.closeModal(); }
      });
      body.addEventListener('input', (e) => { if (e.target.id === 'bt-q') { const v = App.util.norm(e.target.value); body.querySelectorAll('.bt-pk').forEach((c) => { c.hidden = !!v && !c.dataset.q.includes(v); }); } });
    });
  }

  /** Renommer une équipe */
  function renameTeam(name) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      const body = App.util.openModal(`<div class="bt-pick"><h2>Nom de l’équipe</h2>
        <input type="text" id="bt-name" maxlength="24" value="${esc(name)}" autocomplete="off">
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn ghost" data-close>Annuler</button><button class="btn primary" id="bt-name-ok">Valider</button></div></div>`, () => end(null));
      const inp = body.querySelector('#bt-name');
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
      const ok = () => { const v = inp.value.trim(); end(v || null); App.util.closeModal(); };
      body.querySelector('#bt-name-ok').addEventListener('click', ok);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
  }

  /** Avant un combat : avec quelle équipe ? */
  async function chooseTeam(m, o = {}) {
    const S = sideOf(m, o.game);
    const imgs = await Promise.all(S.teams.map((t) => Promise.all(teamItems(t.keys).map((it) => App.col.displayImage(it, adOf(it))))));
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      const body = App.util.openModal(`<div class="bt-pick g-${esc(o.game || 'pokemon')}"><h2>${esc(o.title || 'Avec quelle équipe ?')}</h2>${o.sub ? `<p class="small muted" style="margin:-4px 0 10px">${o.sub}</p>` : ''}
        <div class="bt-choose">${S.teams.map((t, i) => `<button class="bt-ch ${i === S.teamIdx ? 'on' : ''}" data-ch="${i}"><b>${esc(t.name)}</b>
          <span class="bt-ch-cards">${[0, 1, 2].map((j) => imgs[i][j] ? `<img src="${esc(imgs[i][j].src)}" alt="">` : '<i></i>').join('')}</span>
          ${imgs[i].length < 3 ? `<small class="muted">${esc(say(o.game, `${imgs[i].length ? 'complétée' : 'que'} par des Pokémon de prêt`))}</small>` : ''}</button>`).join('')}</div></div>`, () => end(null));
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) { end(+b.dataset.ch); App.util.closeModal(); } });
    });
  }

  Object.assign(App.matchParts, { combatStats, SORTS, HP_MIN, pickTeam, pickBag, renameTeam, chooseTeam });
})();
