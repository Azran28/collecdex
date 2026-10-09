/* Scanner (classeur/rafale) — écran plein écran (analyse, vérification, récapitulatif) — morceau de la fonction de scan-batch.js (découpage automatique v3.06 ; état partagé : X.S). */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.screen = (X, { R, ad, burst, dims, el, esc, isPk, resultsEl, sv }) => {
  const { S } = X;
    // ---------- Écran plein écran de la page (v2.32, idée d'Arnaud : « plus visuel, moins bordélique ») ----------
    // 1) analyse : la carte en cours en grand avec l'animation, ce qui a été lu, la mini-page ;
    // 2) seulement les cartes « à vérifier », une par une, avec de gros boutons ; 3) récapitulatif + « Enregistrer ».
    // La liste détaillée reste disponible (« Voir la liste »), et l'analyse continue pendant ce temps.
    const svBox = () => el.querySelector('#b-sv');
    const lockScroll = (on) => document.documentElement.classList.toggle('sv-lock', on);
    function svOpen(mode, extra = {}) { Object.assign(sv, { open: true, mode, single: false }, extra); lockScroll(true); drawSV(); }
    function svClose() { sv.open = false; lockScroll(false); drawSV(); X.drawResults(); }
    /** Cartes qui méritent un coup d'œil : pas sûres, ou pas reconnues */
    const toCheck = () => S.cells.filter((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state)).map((c) => c.i);
    const cardOf = (c) => c.cands.find((x) => x.id === c.choice) || null;
    const visOf = (x) => esc(ad.img.card(x, 'low'));
    const durTxt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };
    /**
     * La page en vignettes : chaque pochette montre ta photo (grisée en attente), puis le visuel officiel une fois la carte
     * trouvée ; bordure selon l'état ; la carte en cours clignote. Classeur ouvert : les 2 pages côte à côte.
     */
    function miniPage(cur) {
      const per = S.cells.length > 9 && dims()[0] === 6 ? 9 : S.cells.length, cols = per === 9 ? 3 : dims()[0], parts = [];
      for (let s = 0; s < S.cells.length; s += per) parts.push(S.cells.slice(s, s + per));
      const rows = Math.ceil(per / cols);
      const th = (c) => {
        const x = cardOf(c), st = c.saved ? 'saved' : c.state, done = ['sure', 'verifier'].includes(st) || c.saved;
        const src = done && x ? visOf(x) : c.url;
        return `<span class="sv-th st-${st}${c === cur ? ' cur' : ''}${c.found && Date.now() - c.found < 1500 ? ' pop' : ''}" title="Carte ${c.i + 1}">${['vide', 'dos', 'autre', 'don'].includes(st) ? '' : `<img src="${src}" alt="">`}${st === 'sure' || c.saved ? '<b>✓</b>' : st === 'verifier' ? '<b>?</b>' : ''}</span>`;
      };
      return `<div class="sv-board" style="--cols:${cols * parts.length};--rows:${rows}">${parts.map((p) => `<div style="grid-template-columns:repeat(${cols},1fr)">${p.map(th).join('')}</div>`).join('')}</div>`;
    }
    /** Résultat de la certification de la page, rappelé dans l'écran d'analyse (sur téléphone il recouvre tout : avant, le message disparaissait) */
    function svCert() {
      const pc = !burst && S.pageCert; if (!pc) return '';
      return pc.passed ? `<div class="small cert-ok" style="margin:6px 0">${App.icons.icon('shield', 14)} Page certifiée en direct : les cartes bien reconnues seront certifiées</div>`
        : `<div class="small" style="margin:6px 0">${App.icons.icon('shield', 14)} <b>Page non certifiable</b> : ${esc(pc.reasons.join(', '))}</div>`;
    }
    function svTop(label, right, bar) {
      return `<div class="sv-top"><div class="bprog-lbl"><span>${label}</span><b>${right || ''}</b></div>${bar || ''}</div>`;
    }
    /** Écran d'analyse : la carte en cours en grand (rayon de scan), la vignette du visuel trouvé dans son coin, la page en dessous */
    function svScan() {
      const cur = S.cells.find((c) => c.vscan) || S.cells.find((c) => c.state === 'lecture');
      const p = S.prog, off = cur && cardOf(cur);
      const step = !p ? 0 : /^Lecture des/.test(p.step) ? 1 : /^Série/.test(p.step) ? 2 : 3;
      const steps = (burst ? ['Lecture'] : !isPk() ? ['Lecture + image', 'Série'] : ['Lecture', 'Série', 'Image']).map((s, k) => `<span class="${k + 1 === step ? 'on' : k + 1 < step ? 'past' : ''}">${k + 1 < step ? '✓' : k + 1} ${s}</span>`).join('');
      return `
        <div class="sv-head">
          <div class="sv-steps">${steps}</div>
          <div class="sv-count">${p ? `<b>${Math.min(p.done + 1, p.total)}</b><span>/ ${p.total}</span>` : ''}</div>
        </div>
        ${p ? `<div class="bprog-bar ${p.kind === 'img' ? 'img' : ''}"><i style="width:${Math.round((100 * p.done) / Math.max(1, p.total))}%"></i></div>` : ''}
        ${svCert()}
        <div class="sv-stage">
          ${cur ? `<span class="sv-shot"><span class="bphoto sv-card ${cur.vscan ? 'scan-img' : 'scan-txt'}"><img src="${cur.url}" alt="Ta carte ${cur.i + 1}"><i class="bscan"></i>${cur.vscan ? '<i class="bdot"></i>'.repeat(7) : ''}</span>
            ${off ? `<span class="sv-pip ${cur.state === 'sure' ? 'hit' : ''}"><img src="${visOf(off)}" alt="Carte envisagée">${cur.state === 'sure' ? '<b>✓</b>' : ''}</span>` : ''}</span>`
            : '<div class="spinner"></div>'}
        </div>
        <div class="sv-caption">
          <div class="sv-title">${off ? esc(off.name) : cur ? 'Recherche…' : 'Préparation de la page…'}</div>
          <div class="sv-sub">${p ? esc(p.step) : ''}${cur ? ` · carte ${cur.i + 1}` : ''}${cur && cur.info ? ` · lu : ${esc(R.readSummary(cur.info))}` : ''}</div>
        </div>
        ${miniPage(cur)}
        <button class="linkbtn sv-list" data-sv="close">Voir la liste pendant ce temps →</button>`;
    }
    function svReview() {
      const c = S.cells[sv.list[sv.idx]];
      if (!c) return svRecap();
      const cur = cardOf(c);
      const sureN = S.cells.filter((x) => !x.saved && x.state === 'sure').length;
      const others = c.cands.filter((x) => x !== cur).slice(0, 4);
      const twin = cur && others.find((x) => App.util.norm(x.name) === App.util.norm(cur.name));
      const why = !cur ? 'Carte pas reconnue avec certitude : choisis parmi les propositions, ou cherche-la.'
        : twin ? `Même dessin que ${esc(App.views.scan.setLabel(twin))} · ${esc(twin.localId)} : laquelle est-ce ?`
        : 'Pas tout à fait sûr : c’est bien elle ?';
      return `${svTop(sv.single ? `Carte ${c.i + 1}` : `${sureN ? `${sureN} reconnue${sureN > 1 ? 's' : ''} · ` : ''}<span class="warn">${sv.list.length} à vérifier</span>`, sv.single ? '' : `${sv.idx + 1} / ${sv.list.length}`)}
        <div class="sv-pair"><span class="bphoto"><img src="${c.url}" alt="Ta carte ${c.i + 1}"></span>
          ${cur ? `<span class="sv-offwrap vfx vfx-${vfxOf(c, cur)}"><img class="sv-off" src="${visOf(cur)}" alt="Visuel officiel"></span>` : '<span class="sv-off sv-wait"><b>?</b></span>'}</div>
        <div class="sv-name">${cur ? `${esc(cur.name)} <span class="muted">· ${esc(App.views.scan.setLabel(cur))} · ${esc(cur.localId)}</span>` : 'Carte non reconnue'}</div>
        <div class="sv-why">${why}</div>
        ${svVersions(c, cur)}
        ${others.length ? `<div class="sv-alts"><span class="small muted">${cur ? 'Ou bien l’une de celles-ci :' : 'Propositions :'}</span>
          <div>${others.map((x) => `<button class="sv-alt" data-sv="pick" data-id="${esc(x.id)}"><img src="${visOf(x)}" alt=""><span><b>${esc(x.name)}</b></span><span class="muted">${esc(x.localId)} · ${esc((x.set && x.set.name) || '')}</span></button>`).join('')}</div></div>` : ''}
        <div class="sv-acts">
          ${cur ? `<button class="btn primary" data-sv="yes">✓ C’est elle</button>` : ''}
          <button class="btn" data-sv="search">🔎 Chercher</button>
          <button class="btn" data-sv="no">Ne pas l’ajouter</button>
        </div>
        <div class="sv-nav">${!sv.single && sv.idx > 0 ? '<button class="linkbtn" data-sv="prev">← Carte précédente</button>' : '<span></span>'}<button class="linkbtn" data-sv="close">Voir la liste détaillée</button></div>`;
    }
    /** Version de la carte (normale / holo / reverse, 1re édition) : mesurée sur la photo, corrigeable ici avant l'enregistrement */
    function svVersions(c, cur) {
      if (!cur || !cur.variants) return '';
      const opts = X.baseOpts(cur), fe = !!cur.variants.firstEdition;
      if (opts.length <= 1 && !fe) return '';
      const v = (c.det && c.det.id === cur.id && X.versOf(c)) || [];
      const how = !c.det || c.det.id !== cur.id || c.det.measuring ? 'mesure…' : c.det.user ? 'choisie' : c.det.sure ? 'mesurée sur la photo' : 'à vérifier';
      const b = v.find((x) => x !== 'firstEdition');
      const hint = { holo: 'Aperçu holo : l’illustration brille.', reverse: 'Aperçu reverse : tout brille sauf l’illustration.', normal: 'Normale : rien ne brille.' }[b] || '';
      return `<div class="sv-vers"><span class="small muted">Version <span class="${how === 'à vérifier' ? 'warn' : ''}">(${how})</span></span>
        <div class="chips">${opts.map((k) => `<button class="chip ${v.includes(k) ? 'on' : ''}" data-sv="vbase" data-v="${k}">${X.VN[k]}</button>`).join('')}
        ${fe ? `<button class="chip ${v.includes('firstEdition') ? 'on' : ''}" data-sv="vfe">1ʳᵉ éd.</button>` : ''}</div>
        ${hint && opts.length > 1 ? `<span class="small muted">${hint} <span class="sv-vnote">(simulé sur le visuel officiel : TCGdex n’a qu’une image par carte)</span></span>` : ''}</div>`;
    }
    /**
     * Effet de la version sur le visuel officiel (demande d'Arnaud : comparer avec sa carte) : TCGdex n'a qu'une image
     * par carte, on simule donc où ça brille — holo = l'illustration, reverse = tout sauf l'illustration.
     */
    function vfxOf(c, cur) {
      if (!cur || !cur.variants || !c.det || c.det.id !== cur.id || c.det.measuring) return '';
      const b = (X.versOf(c) || []).find((x) => x !== 'firstEdition');
      return b === 'holo' || b === 'reverse' ? b : '';
    }
    /**
     * Étiquette de version posée sur la carte dans le récapitulatif (demande d'Arnaud) : ce qui a été trouvé,
     * orange avec « ? » si pas sûr ; un appui passe à la version suivante (normale → holo → reverse).
     */
    function versPill(c, cur) {
      if (!cur.variants) return '';
      const opts = X.baseOpts(cur); if (opts.length <= 1) return ''; // une seule version possible : rien à choisir
      const measured = c.det && c.det.id === cur.id && !c.det.measuring;
      const v = (measured && X.versOf(c)) || [], base = v.find((x) => x !== 'firstEdition');
      const doubt = !measured || (!c.det.user && !c.det.sure);
      const label = measured ? `${X.VN[base] || '—'}${v.includes('firstEdition') ? ' · 1ʳᵉ éd.' : ''}` : 'Version…';
      return `<button class="sv-vpill ${doubt ? 'doubt' : ''}" data-sv="vcycle" data-i="${c.i}" title="Touche pour passer à la version suivante">${label}${doubt && measured ? ' ?' : ''} <span aria-hidden="true">↻</span></button>`;
    }
    function svRecap() {
      const shown = S.cells.filter((c) => c.choice || !['vide', 'dos', 'autre', 'don', 'erreur'].includes(c.state));
      const ign = S.cells.length - shown.length;
      const chosen = S.cells.filter((c) => c.choice && !c.saved && X.modeOf(c) !== 'rien');
      const tag = (c) => {
        if (c.saved) return ['ok', 'Enregistrée ✓'];
        if (!c.choice || !c.checked) return ['off', 'Pas ajoutée'];
        const m = X.modeOf(c);
        return m === 'nouvelle' ? ['new', 'Nouvelle'] : m === 'doublon' ? ['dup', 'Doublon'] : m === 'photo' ? ['dup', 'Nouvelle photo'] : ['own', 'Déjà dans ton Dex'];
      };
      return `${svTop('<b>Récapitulatif de la page</b>', S.pageDur ? `<span class="muted small">analyse : ${durTxt(S.pageDur)}</span>` : '')}${svCert()}
        <div class="sv-recap">${shown.map((c) => { const cur = cardOf(c), [k, t] = tag(c), vp = !c.saved && cur ? versPill(c, cur) : ''; return `<div class="sv-rc ${k}">
          <button class="sv-rc-open vfx vfx-${cur ? vfxOf(c, cur) : ''}" data-sv="open" data-i="${c.i}" ${c.saved ? 'disabled' : ''}><img src="${cur ? visOf(cur) : c.url}" alt=""><span class="sv-badge">${t}</span></button>
          ${vp}<span class="sv-rn">${cur ? esc(cur.name) : 'Non reconnue'}</span></div>`; }).join('')}</div>
        <div class="small muted sv-hint">${ign ? `${ign} case${ign > 1 ? 's' : ''} ignorée${ign > 1 ? 's' : ''} (vide, dos ou autre jeu). ` : ''}Touche une carte pour la changer, ou son étiquette de version (<b class="warn">?</b> = pas sûre) pour passer à la suivante.</div>
        <div class="sv-acts sv-final">
          <button class="btn primary" data-sv="save" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
          <button class="btn" data-sv="close">Voir la liste détaillée</button>
        </div>`;
    }
    function drawSV() {
      const box = svBox(); if (!box) return;
      box.classList.toggle('hidden', !sv.open);
      if (!sv.open) { box.innerHTML = ''; return; }
      const ph = sv.mode !== 'scan' ? 'done' : S.cells.some((c) => c.vscan) ? 'img' : 'txt'; // couleurs de l'étape
      box.innerHTML = `<div class="sv-in sv-m-${sv.mode} ph-${ph}">${sv.mode === 'scan' ? svScan() : sv.mode === 'review' ? svReview() : svRecap()}</div>`;
    }
    /** Fin de l'analyse : cartes à vérifier d'abord, sinon directement le récapitulatif */
    function svAfterScan() {
      if (!sv.open) return;
      const l = toCheck();
      if (l.length) svOpen('review', { list: l, idx: 0 }); else svOpen('recap');
    }
    /** Rafale (au moins 2 cartes) : écran d'analyse ; lectures en cours → défilement, sinon cartes douteuses puis récapitulatif */
    function burstReview() {
      if (S.rPending > 0) return svOpen('scan');
      const l = toCheck();
      if (l.length) svOpen('review', { list: l, idx: 0 }); else svOpen('recap');
    }
    function svAction(b) {
      const a = b.dataset.sv, c = sv.mode === 'review' ? S.cells[sv.list[sv.idx]] : null;
      const next = () => {
        if (sv.single || sv.idx >= sv.list.length - 1) Object.assign(sv, { mode: 'recap', single: false }); else sv.idx++;
        X.drawResults(); drawSV();
        const box = svBox(); if (box) box.scrollTop = 0;
      };
      if (a === 'close') return svClose();
      if (a === 'prev') { sv.idx = Math.max(0, sv.idx - 1); return drawSV(); }
      if (a === 'yes' && c) { c.checked = true; c.mode = null; return next(); }
      if (a === 'no' && c) { c.checked = false; return next(); }
      if (a === 'pick' && c) { // une autre proposition : on la montre en grand, il reste à confirmer
        c.choice = b.dataset.id; c.mode = null; c.checked = true; if (c.state === 'inconnue') c.state = 'verifier';
        X.drawResults(); return drawSV();
      }
      if (a === 'search' && c) {
        svClose();
        const box = resultsEl.querySelector(`[data-box="${c.i}"]`), tile = resultsEl.querySelector(`.btile[data-i="${c.i}"]`);
        if (box) box.classList.remove('hidden');
        if (tile) tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const inp = resultsEl.querySelector(`[data-name="${c.i}"]`); if (inp) setTimeout(() => inp.focus(), 400);
        return;
      }
      if (a === 'open') return svOpen('review', { list: [+b.dataset.i], idx: 0, single: true });
      if (a === 'vcycle') { // version suivante, directement depuis le récapitulatif
        const cc = S.cells[+b.dataset.i], cur = cc && cardOf(cc); if (!cur) return;
        const opts = X.baseOpts(cur), now = ((cc.det && cc.det.id === cur.id && X.versOf(cc)) || []).find((x) => x !== 'firstEdition');
        if (!cc.det || cc.det.id !== cur.id) cc.det = { id: cur.id, list: [] };
        cc.det.base = opts[(opts.indexOf(now) + 1) % opts.length]; cc.det.user = true; cc.det.measuring = false;
        X.drawResults(); return drawSV();
      }
      if ((a === 'vbase' || a === 'vfe') && c) { // version corrigée à la main
        const cur = cardOf(c); if (!cur) return;
        if (!c.det || c.det.id !== cur.id) c.det = { id: cur.id, list: [] };
        const had = (X.versOf(c) || []).includes('firstEdition');
        if (a === 'vbase') c.det.base = b.dataset.v; else c.det.fe = !had;
        c.det.user = true; c.det.measuring = false;
        X.drawResults(); return drawSV();
      }
      if (a === 'save') { svClose(); const add = resultsEl.querySelector('#b-add'); if (add) add.click(); }
    }

  return { burstReview, drawSV, lockScroll, svAction, svAfterScan, svBox, svClose, svOpen, toCheck };
};
