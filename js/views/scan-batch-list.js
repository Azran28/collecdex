/* Scanner (classeur/rafale) — liste des cartes reconnues, versions, lecture de chaque case — morceau de la fonction de scan-batch.js (découpage automatique v3.06 ; état partagé : X.S). */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.list = (X, { R, ad, alive, burst, dims, esc, isPk, readCard, resultsEl, setStatus, sv, urls }) => {
  const { S } = X;
    /** Chronomètre de la vérification par l'image (réglage « Afficher le temps de chaque étape »), affiché sous la liste */
    function timingHtml() {
      if (!S.timing || App.settings.visualCheck === false || !App.settings.showTiming) return '';
      const s = (ms) => (ms == null ? '—' : ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
      const w = S.timing.warm;
      return `<div class="panel small" style="margin-top:12px"><b>⏱ Temps (essai de la vérification par l’image)</b><br>
        ${S.timing.text != null ? `Lecture du texte : ${s(S.timing.text)} · ` : ''}Chargement des outils : ${w ? s(w.ms) + ' (pendant la lecture)' : '—'}
        ${S.timing.total != null ? ` · Visuels officiels à préparer : ${s(S.timing.refs)}${S.timing.dl ? ` (${S.timing.dl} téléchargés${S.timing.fail ? `, dont ${S.timing.fail} en échec` : ''})` : ''} · Comparaison : ${s(S.timing.match)}${S.timing.cards ? ` (${s(S.timing.match / S.timing.cards)} par carte)` : ''} · <b>Total image : ${s(S.timing.total)}</b>` : ''}
        ${S.timing.error ? `<br><span class="bad">Problème : ${esc(S.timing.error)}</span>` : ''}
        <br><span class="muted">${esc(navigator.hardwareConcurrency || '?')} cœurs · calcul ${esc((w && w.backend) || S.timing.backend || '?')}</span></div>`;
    }
    function undoSeries() {
      for (const c of S.cells) if (c.before && !c.saved) { Object.assign(c, c.before); delete c.before; }
      S.detected = null; drawResults();
    }

    /** Lecture d'une pochette : vide, dos, autre jeu, ou carte Pokémon (candidats) */
    async function recogOne(cell, hint, st) {
      if (await R.looksEmpty(cell.blob)) { cell.state = 'vide'; return; }
      // dos : sûr pour Pokémon (dos 0,71–0,80, faces ≤ 0,47) ; pour One Piece le dos uni bleu ressemble à des faces ternes
      // (Événement en pochette : 0,61, vrais dos 0,53–0,58) → la carte est quand même lue, « dos » seulement si rien n’est reconnu
      const back = await R.looksLikeBack(cell.blob, S.game).catch(() => false);
      if (back && isPk()) { cell.state = 'dos'; return; }
      const { info, cands } = await readCard(cell.blob, hint, st, cell.orig, cell.ctx);
      if (back && !(cands[0] && (cands[0].confident || cands[0].numOk || (cands[0].orb || 0) >= 25))) { cell.state = 'dos'; cell.cands = []; cell.choice = ''; cell.checked = false; return; }
      cell.info = info; cell.cands = cands;
      if (info && info.crop) { cell.blob = info.crop; cell.url = URL.createObjectURL(info.crop); urls.push(cell.url); } // meilleur cadrage (One Piece) : photo de la case
      if (info && info.cropLater) { const shown = cell.blob; info.cropLater.then((c) => { if (!c || cell.saved || cell.blob !== shown || !alive()) return; cell.blob = c; cell.url = URL.createObjectURL(c); urls.push(cell.url); drawResults(); }); } // (vrais bords, trouvés après coup)
      if (info && info.don) { cell.state = 'don'; cell.cands = []; cell.choice = ''; cell.checked = false; return; } // carte DON!! (One Piece) : pas encore gérée
      if (info && info.otherGame && !(cands[0] && cands[0].confident)) { cell.state = 'autre'; cell.cands = []; cell.choice = ''; cell.checked = false; return; }
      cell.choice = cands[0] ? cands[0].id : '';
      cell.state = !cands.length ? 'inconnue' : cands[0].confident ? 'sure' : 'verifier';
      // meilleure candidate qui ne ressemble pas à la photo, nom et numéro non lus : on ne la propose pas d'office
      const top = cands[0];
      if (top && !top.confident && !top.numOk && top.visual != null && top.visual < 0.42 && (top.nameScore || 0) < 0.75) { cell.choice = ''; cell.state = 'inconnue'; }
      cell.checked = cell.state === 'sure'; // seules les cartes sûres sont cochées d'office
    }

    /** (Re)lit une seule pochette, par ex. après un recadrage */
    async function recogCell(cell, hint, force = false) {
      cell.state = 'lecture'; cell.cands = []; cell.choice = ''; cell.info = null; cell.mode = null; drawResults();
      const st = (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Carte ${cell.i + 1} — ${esc(m)}</div>`); };
      try {
        if (!force && await R.looksEmpty(cell.blob)) { cell.state = 'vide'; }
        else {
          const { info, cands } = await readCard(cell.blob, hint, st, cell.orig, cell.ctx);
          cell.info = info; cell.cands = cands;
          if (info && info.crop) { cell.blob = info.crop; cell.url = URL.createObjectURL(info.crop); urls.push(cell.url); }
      if (info && info.cropLater) { const shown = cell.blob; info.cropLater.then((c) => { if (!c || cell.saved || cell.blob !== shown || !alive()) return; cell.blob = c; cell.url = URL.createObjectURL(c); urls.push(cell.url); drawResults(); }); } // (vrais bords, trouvés après coup)
          cell.choice = cands[0] ? cands[0].id : '';
          cell.state = !cands.length ? 'inconnue' : cands[0].confident ? 'sure' : 'verifier';
          cell.checked = cell.state === 'sure';
        }
      } catch (e) { console.error(e); cell.state = 'erreur'; cell.error = e.message; }
    }

    const stateLabel = {
      attente: ['En attente', ''], lecture: ['Lecture…', ''], vide: ['Pochette vide', 'muted'], dos: ['Dos de carte (ignoré)', 'muted'], autre: [`Autre jeu que ${ad.name} (ignorée)`, 'muted'], don: ['Carte DON!! (pas encore gérée)', 'muted'],
      sure: ['Reconnue ✓', 'ok'], verifier: ['À vérifier', 'warn'], inconnue: ['Non reconnue', 'bad'], erreur: ['Erreur', 'bad'],
      enregistree: ['Enregistrée ✓', 'ok'],
    };

    /** Que faire de la carte de cette pochette ? (si l'utilisateur n'a pas choisi lui-même) */
    function modeOf(c) {
      if (!c.choice || !c.checked || c.saved) return 'rien';
      if (c.mode) return c.mode;
      const owned = !!App.col.get(S.game, c.choice);
      const earlier = S.cells.some((o) => o.i < c.i && o.choice === c.choice);
      if (earlier) return 'doublon';          // 2 pochettes = 2 exemplaires physiques
      return owned ? 'rien' : 'nouvelle';     // déjà possédée : on ne compte qu'un exemplaire, sauf choix contraire
    }
    const modeLabels = { nouvelle: 'Nouvelle carte', rien: 'Déjà possédée : ne rien changer', photo: 'Même carte : utiliser cette photo', doublon: 'Autre exemplaire (doublon)' };

    // ---------- Version de chaque carte (normale / holo / reverse / 1re édition), mesurée AVANT l'ajout ----------
    const VN = { normal: 'Normale', holo: 'Holo', reverse: 'Reverse', firstEdition: '1ʳᵉ édition' };
    const baseOpts = (cur) => ['normal', 'holo', 'reverse'].filter((k) => cur && cur.variants && cur.variants[k]);
    /** Version retenue pour une case : celle mesurée sur la photo, ou celle corrigée à la main */
    const versOf = (c) => {
      if (!c.det) return null;
      const base = c.det.base || (c.det.list || []).find((v) => v !== 'firstEdition') || null;
      const fe = c.det.fe != null ? c.det.fe : (c.det.list || []).includes('firstEdition');
      return [base, fe ? 'firstEdition' : null].filter(Boolean);
    };
    /** Mesure la brillance de la photo (reflets de l'illustration, du fond, logo 1re édition) pour la carte choisie */
    async function measureVers(c) {
      const cur = c.cands.find((x) => x.id === c.choice);
      // pas d'info de version pour cette carte : on le note (sinon elle serait remesurée sans fin et la page se figerait)
      if (!cur || !cur.variants) { c.det = { id: c.choice, list: [], none: true }; return; }
      const id = cur.id;
      c.det = { id, measuring: true, list: [] };
      try {
        const d = await R.detectVariants(c.blob, cur.variants, ad.img.card(cur, 'high'));
        // (« sûre » seulement si la mesure l'est vraiment ; une version choisie à la main pendant la mesure n'est pas écrasée)
        if (c.choice === id && !(c.det && c.det.user)) c.det = { id, list: d.list, sure: !!(d.sure && d.sure.base), info: d.info };
      } catch (e) { if (c.choice === id) c.det = { id, list: [], sure: false }; }
    }
    const versHtml = (c, cur) => {
      if (!cur || !cur.variants) return '';
      const opts = baseOpts(cur), fe = !!cur.variants.firstEdition;
      if (!c.det || c.det.id !== cur.id) return '';
      if (c.det.measuring) return `<div class="small muted bvers">${App.icons.icon('sparkles', 12)} Brillance : mesure…</div>`;
      const v = versOf(c) || [], base = v.find((x) => x !== 'firstEdition') || opts[0];
      if (opts.length <= 1 && !fe) return opts.length ? `<div class="small bvers">${App.icons.icon('sparkles', 12)} ${VN[opts[0]]} <span class="muted">(seule version de cette carte)</span></div>` : '';
      return `<div class="small bvers">${App.icons.icon('sparkles', 12)} Version :
        ${opts.length > 1 ? `<select data-vbase="${c.i}">${opts.map((k) => `<option value="${k}" ${k === base ? 'selected' : ''}>${VN[k]}</option>`).join('')}</select>` : `<b>${VN[opts[0]] || ''}</b>`}
        ${fe ? `<label class="check"><input type="checkbox" data-vfe="${c.i}" ${v.includes('firstEdition') ? 'checked' : ''}> 1ʳᵉ éd.</label>` : ''}
        <span class="muted">(${c.det.user ? 'choisie' : c.det.sure ? 'mesurée sur la photo' : 'mesurée, à vérifier'})</span></div>`;
    };

    function drawResults() {
      if (sv.open) X.drawSV(); // l'écran plein écran suit l'analyse (et les versions mesurées en arrière-plan)
      const [cols] = dims();
      const chosen = S.cells.filter((c) => c.choice && modeOf(c) !== 'rien');
      const savedN = S.cells.filter((c) => c.saved).length, leftN = S.cells.filter((c) => !c.saved && c.choice).length;
      resultsEl.innerHTML = `
        ${S.running && S.prog ? `<div class="bprog" role="status"><div class="bprog-lbl"><span>${esc(S.prog.step)}</span><b>${Math.min(S.prog.done + 1, S.prog.total)} / ${S.prog.total}</b></div>
          <div class="bprog-bar ${S.prog.kind === 'img' ? 'img' : ''}"><i style="width:${Math.round((100 * S.prog.done) / Math.max(1, S.prog.total))}%"></i></div></div>` : ''}
        ${savedN ? `<div class="panel" style="margin-bottom:12px"><b>✓ ${savedN} carte${savedN > 1 ? 's' : ''} enregistrée${savedN > 1 ? 's' : ''}</b> dans ta collection.
          ${leftN ? ` Il reste ${leftN} carte${leftN > 1 ? 's' : ''} ${burst ? 'dans la rafale' : 'sur cette page'} : coche celles que tu veux ajouter, corrige-les si besoin, puis enregistre à nouveau.` : ''}
          <div class="row" style="margin-top:8px"><button class="btn sm primary" id="b-next">${burst ? 'Nouvelle rafale' : 'Page suivante'}</button><a class="btn sm" href="#/collection">Voir mon Dex</a></div></div>` : ''}
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">${burst ? `Cartes capturées <span class="muted small">(${S.cells.length})</span>` : 'Résultat de la page'}</h3><span class="spacer"></span>
          ${!S.running && S.cells.length && (!burst || S.cells.length >= 2) ? `<button class="btn sm" id="b-sv-open">${X.toCheck().length === 1 ? 'Vérifier la carte douteuse' : X.toCheck().length ? `Vérifier les ${X.toCheck().length} cartes douteuses` : 'Récapitulatif'}</button>` : ''}
          ${!S.running && S.cells.length ? `<button class="btn sm ghost" id="b-all">Tout cocher</button><button class="btn sm ghost" id="b-none">Tout décocher</button>
            <span class="muted small">${chosen.length} carte${chosen.length > 1 ? 's' : ''} à enregistrer</span>` : ''}</div>
        ${S.detected ? `<div class="detect-bar small">${App.icons.icon('layers', 15)}<span>${S.detected.auto ? `Série devinée : <b>${esc(S.detected.name)}</b> (d’après ${S.detected.nb} cartes de la page). Les cartes incertaines ont été recomparées à cette série.` : `Cartes incertaines recomparées à <b>${esc(S.detected.name)}</b>.`}</span>
          ${S.running ? '' : '<button class="btn sm ghost" id="b-undo-series">Ce n’est pas la bonne série : annuler</button>'}</div>` : ''}
        ${!S.running && S.cells.length && !S.detected && S.cells.some((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state)) ? `<div class="row small" style="margin:0 0 10px;gap:6px"><span class="muted">Des cartes à vérifier ? Si la page vient d’une seule série :</span>
          <select id="b-set-after" style="max-width:220px"><option value="">Choisir la série…</option></select></div>` : ''}
        <div class="btiles" style="grid-template-columns:repeat(${cols}, minmax(0, 1fr))">
          ${S.cells.map((c) => {
            const [lab, cls] = stateLabel[c.state];
            const cur = c.cands.find((x) => x.id === c.choice);
            const own = cur && App.col.get(S.game, cur.id);
            const repeat = cur && S.cells.some((o) => o.i < c.i && o.choice === c.choice);
            const m = modeOf(c);
            if (c.saved) {
              return `<div class="btile saved" data-i="${c.i}">
                <div class="bimgs"><img src="${c.url}" alt=""><img src="${esc(ad.img.card(cur, 'low'))}" alt="" data-alt=""></div>
                <div class="bstate ok">${c.i + 1}. Enregistrée ✓</div>
                <div class="small"><b>${esc(cur ? cur.name : '')}</b> <span class="muted">${esc(cur && cur.set ? cur.set.name : '')}</span></div>
                ${c.vers && c.vers.length ? `<div class="small">${App.icons.icon('sparkles', 12)} ${c.vers.map((v) => ({ normal: 'Normale', reverse: 'Reverse', holo: 'Holo', firstEdition: '1ʳᵉ édition' }[v] || v)).join(' · ')} <button class="linkbtn small" data-open-card="${esc(cur.id)}">modifier</button></div>` : ''}
                ${c.cert === 'encours' ? `<div class="small muted">${App.icons.icon('shield', 12)} Certification…</div>`
                  : c.cert === 'ok' ? `<div class="small cert-ok">${App.icons.icon('shield', 13)} Certifiée</div>`
                  : c.cert ? `<div class="small muted">${App.icons.icon('shield', 12)} Non certifiée : ${esc(c.cert)}${cur ? ` · <a href="#/scan?carte=${encodeURIComponent(cur.id)}">la capturer seule</a>` : ''}</div>` : ''}
                ${c.photoId && S.photo ? `<button class="btn sm ghost" data-recrop="${c.i}">✂ Recadrer</button>` : ''}
              </div>`;
            }
            const canCheck = !!c.choice && !['attente', 'lecture'].includes(c.state);
            // animation d'attente : rayon de scan pendant la lecture, points clés pendant la vérification par l'image,
            // petit éclat quand la carte vient d'être trouvée (seulement la carte en cours : batterie)
            const scan = c.vscan ? 'scan-img' : c.state === 'lecture' ? 'scan-txt' : '';
            const found = c.found && Date.now() - c.found < 1200;
            return `<div class="btile ${(['vide', 'dos', 'autre', 'don'].includes(c.state) && !c.choice) || (canCheck && !c.checked) ? 'dim' : ''} ${c.checked && c.choice ? 'on' : ''} ${c.state === 'attente' ? 'bwait' : ''} ${found ? 'bfound' : ''}" data-i="${c.i}">
              ${canCheck ? `<label class="bcheck"><input type="checkbox" data-check="${c.i}" ${c.checked ? 'checked' : ''}> Ajouter</label>` : ''}
              <div class="bimgs">
                <span class="bphoto ${scan}"><img src="${c.url}" alt="Ta carte ${c.i + 1}">${scan ? `<i class="bscan"></i>${scan === 'scan-img' ? '<i class="bdot"></i>'.repeat(7) : ''}` : ''}</span>
                ${cur ? `<img class="bofficial" src="${esc(ad.img.card(cur, 'low'))}" alt="Visuel officiel" data-alt="" title="Visuel officiel">` : '<span class="bnone">?</span>'}
              </div>
              <div class="bstate ${cls}">${c.i + 1}. ${lab}${c.visId && c.choice === c.visId ? ' <span class="muted">· image ✓</span>' : ''}${c.info ? ` <span class="muted">· ${esc(R.readSummary(c.info))}</span>` : ''}</div>
              ${['attente', 'lecture', 'dos', 'autre', 'don'].includes(c.state) && !c.choice ? (['dos', 'autre', 'don'].includes(c.state) ? `<button class="btn sm" data-notback="${c.i}">${c.state === 'dos' ? 'Ce n’est pas un dos' : 'C’est une carte Pokémon'} : la reconnaître</button><button class="btn sm ghost" data-find="${c.i}">🔎 Chercher à la main</button>
                <div class="bsearch hidden" data-box="${c.i}"><input type="text" placeholder="Nom" data-name="${c.i}"><input type="text" placeholder="N° ex. 025/165" data-num="${c.i}"><button class="btn sm" data-dosearch="${c.i}">OK</button></div>` : '') : `
                <select data-choice="${c.i}">
                  <option value="">— Ne pas ajouter —</option>
                  ${c.cands.map((x) => `<option value="${esc(x.id)}" ${x.id === c.choice ? 'selected' : ''}>${esc(x.name)} · ${esc(App.views.scan.setLabel(x))} · ${esc(x.localId)}</option>`).join('')}
                </select>
                ${versHtml(c, cur)}
                ${cur ? `<button class="btn sm ghost" data-versions="${c.i}">Toutes les versions de « ${esc(cur.name)} »</button>` : ''}
                ${own || repeat ? `<select data-mode="${c.i}" title="Carte déjà possédée ou en double">
                    ${(own ? ['rien', 'photo', 'doublon'] : ['doublon', 'rien']).map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${k === 'doublon' && repeat && !own ? '2e exemplaire sur la page (doublon)' : k === 'rien' && !own ? 'Ne pas la compter' : modeLabels[k]}</option>`).join('')}
                  </select>
                  ${own ? `<div class="small muted">Tu l’as déjà (×${own.qty})</div>` : ''}` : ''}
                ${S.photo && c.box ? `<button class="btn sm ghost" data-recrop="${c.i}">✂ Recadrer depuis la page</button>` : ''}
                <button class="btn sm ghost" data-find="${c.i}">🔎 Chercher une autre carte</button>
                <div class="bsearch hidden" data-box="${c.i}">
                  <input type="text" placeholder="Nom" data-name="${c.i}">
                  <input type="text" placeholder="N° ex. 025/165" data-num="${c.i}">
                  <button class="btn sm" data-dosearch="${c.i}">OK</button>
                </div>`}
            </div>`;
          }).join('')}
        </div>
        ${burst ? '' : timingHtml()}
        ${!S.running && S.cells.length ? `<div class="row action-dock" style="margin-top:16px">
          <button class="btn primary" id="b-add" ${chosen.length ? '' : 'disabled'}>✓ Enregistrer ${chosen.length} carte${chosen.length > 1 ? 's' : ''} dans mon Dex</button>
          <span class="muted small">${chosen.length ? 'Vérifie les cartes cochées, puis enregistre.' : 'Coche les cartes à ajouter.'}</span>
        </div>` : ''}`;
      const sa = resultsEl.querySelector('#b-set-after'); if (sa && S.allSets) App.views.scan.fillSetSelect(sa, S.allSets);
      // brillance des cartes reconnues (ou changées) : mesurée en arrière-plan, affichée dès qu'elle est prête
      for (const c of S.cells) {
        if (!isPk() || c.saved || !c.choice || c.state === 'lecture' || (c.det && c.det.id === c.choice)) continue; // (versions holo / reverse : Pokémon)
        measureVers(c).then(() => { if (alive()) setTimeout(drawResults, 0); }); // (setTimeout : la page garde la main entre deux mesures)
      }
    }

  return { VN, baseOpts, drawResults, modeOf, recogCell, recogOne, undoSeries, versOf };
};
