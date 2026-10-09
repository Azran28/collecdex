/* Scanner (classeur) — série de la page devinée et vérification par l’image — morceau de la fonction de scan-batch.js (découpage automatique v3.06 ; état partagé : X.S). */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.series = (X, { R, ad, alive, esc, isPk, setStatus, urls }) => {
  const { S } = X;
    /**
     * Série de la page devinée (prudemment) : chaque carte vote pour les séries de ses meilleures candidates
     * (une réimpression presque aussi ressemblante compte aussi : ex. Set de Base / Évolutions).
     * Il faut au moins 3 cartes (et un tiers des cartes lues) d’accord, plus que pour toute autre série, et la moitié des cartes sûres.
     */
    async function guessSeries() {
      const read = S.cells.filter((c) => !c.saved && c.cands.length && !['vide', 'dos', 'autre', 'don', 'erreur'].includes(c.state));
      if (read.length < 3) return;
      const votes = {}, names = {}; let sureN = 0; const sureBy = {};
      for (const c of read) {
        const top = c.cands[0], seen = new Set();
        if (c.state === 'sure' && top.set) { sureN++; sureBy[top.set.id] = (sureBy[top.set.id] || 0) + 1; }
        for (const x of c.cands) {
          if (!x.set || seen.has(x.set.id)) continue;
          if (/promo/i.test(x.set.name || '') || /^[a-z]+p$/i.test(x.set.id)) continue; // une page rangée par série n'est pas une page de promos
          // la meilleure candidate compte si elle ressemble vraiment à la photo ; une autre, si elle la talonne
          const close = x === top ? (c.state === 'sure' || (top.visual != null && top.visual >= 0.45) || (top.orb || 0) >= 25 || (top.nameScore || 0) >= 0.8)
            : (c.state !== 'sure' && x.visual != null && top.visual != null && x.visual >= 0.5 && top.visual - x.visual <= 0.12);
          if (!close) continue;
          seen.add(x.set.id); votes[x.set.id] = (votes[x.set.id] || 0) + 1; names[x.set.id] = x.set.name;
        }
      }
      const ranked = Object.entries(votes).sort((x, y) => y[1] - x[1]);
      console.info('[série de la page]', ranked.slice(0, 4).map(([k, v]) => `${names[k]} ${v}`).join(' · '), `(${read.length} cartes lues)`);
      let [best, nb] = ranked[0] || [];
      const second = ranked[1] ? ranked[1][1] : 0;
      // (sans risque : une carte n'est remplacée que si elle est reconnue avec certitude dans la série, et tout s'annule)
      if (!best || nb < 3 || nb < read.length * 0.34 || (sureN && (sureBy[best] || 0) < sureN * 0.5)) return;
      if (nb === second) {
        if (!isPk()) return; // (One Piece : pas de lecture « dans une série », la page reste telle quelle)
        // égalité (ex. Set de Base et sa réimpression Évolutions) : on essaie les deux séries, la meilleure l'emporte
        const tied = ranked.filter((r) => r[1] === nb).slice(0, 2).map((r) => r[0]);
        const sureIn = {};
        for (const sid of tied) {
          sureIn[sid] = 0;
          for (const c of read) {
            if (S.stopped || !alive()) return;
            setStatus(`<div class="spinner"></div><div style="text-align:center">Quelle série ? Comparaison avec ${esc(names[sid])}…</div>`);
            // total des meilleures notes dans la série (ressemblance, nom, PV lus…), les cartes sûres comptent double
            try { const r = await R.inSet(c.blob, c.info, sid); if (r[0]) sureIn[sid] += r[0].score + (r[0].confident ? r[0].score : 0); } catch (e) { /* */ }
          }
        }
        setStatus('');
        console.info('[série de la page] égalité', tied.map((t) => `${names[t]} ${sureIn[t].toFixed(2)}`).join(' / '));
        if (Math.abs(sureIn[tied[0]] - sureIn[tied[1]]) < 0.3) return;
        best = sureIn[tied[0]] > sureIn[tied[1]] ? tied[0] : tied[1];
      }
      await applySeries(best, names[best], nb, true);
    }

    /**
     * Recompare les cartes incertaines à une série donnée (détectée ou choisie après coup).
     * On ne remplace le choix que si la carte est reconnue avec certitude (ou même nom réimprimé) ;
     * sinon les cartes de la série sont juste ajoutées à la liste. Tout est annulable.
     */
    async function applySeries(setId, name, nb, auto) {
      S.detected = { id: setId, name, nb, auto };
      // (One Piece : une carte déjà de cette série n'est pas relue — elle ne changerait pas, ~15 s de gagnées par carte)
      const inSetAlready = (c) => !isPk() && c.cands[0] && ((c.cands[0].set && c.cands[0].set.id) || c.cands[0].setId) === setId;
      const todo = S.cells.filter((c) => !c.saved && ['verifier', 'inconnue'].includes(c.state) && c.info && !inSetAlready(c));
      for (const cell of todo) cell.before = cell.before || { cands: cell.cands, choice: cell.choice, state: cell.state, checked: cell.checked };
      X.drawResults();
      for (const cell of todo) {
        if (S.stopped || !alive()) return;
        cell.state = 'lecture'; X.drawResults();
        try {
          // One Piece : la carte est simplement relue avec cette série en tête des propositions
          if (!isPk()) { await X.recogOne(cell, setId, () => {}); continue; }
          const cands = await R.inSet(cell.blob, cell.info, setId, (m) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">Série ${esc(name)} — carte ${cell.i + 1} : ${esc(m)}</div>`); });
          let top = cands[0], sameName = false;
          const old = cell.before.cands[0];
          if (old && old.set && old.set.id !== setId) {
            // même nom (ou presque : « Lippoutou-ex » ↔ « Lippoutou »)
            const on = App.util.norm(old.name);
            const same = cands.find((x) => App.util.norm(x.name) === on) || cands.slice(0, 3).find((x) => { const xn = App.util.norm(x.name); return xn.length >= 4 && (on.startsWith(xn) || xn.startsWith(on)); });
            if (same) { top = same; sameName = true; cands.splice(cands.indexOf(same), 1); cands.unshift(same); }
          }
          const seen = new Set(cands.map((x) => x.id));
          cell.cands = [...cands, ...cell.before.cands.filter((x) => !seen.has(x.id))].slice(0, 12);
          // nettement la plus ressemblante de la série (sans être sûre) : proposée, mais « À vérifier » et non cochée
          const ahead = top && !top.confident && cands[1] && top.visual != null && top.visual >= 0.45 && (top.score - cands[1].score >= 0.25 || !cell.before.choice);
          if (top && (sameName || top.confident || ahead)) { cell.choice = top.id; cell.state = top.confident ? 'sure' : 'verifier'; }
          else { cell.choice = cell.before.choice; cell.state = cell.before.state; }
        } catch (e) { console.error(e); Object.assign(cell, { cands: cell.before.cands, choice: cell.before.choice, state: cell.before.state }); }
        cell.checked = cell.state === 'sure';
        X.drawResults();
      }
      setStatus('');
    }
    /**
     * Vérification par l'image (v2.31, méthode choisie avec le Labo : 96 % des 90 cartes de test contre 53 % en classeur) :
     * 1) chaque carte est comparée aux visuels de ses candidates (trouvées par le texte) ;
     * 2) série de la page = celle choisie, devinée, ou celle d'au moins 2 cartes nettement reconnues à l'image ;
     * 3) série connue : chaque carte est comparée à toute la série (le réseau de neurones présélectionne,
     *    les points clés tranchent), les cartes de la série passent devant une réimpression au même dessin.
     * Une carte reconnue à l'image (score ≥ 25) devient le choix ; « à vérifier » si une autre la talonne (même dessin)
     * ou si le texte avait trouvé une autre carte avec certitude.
     */
    const uniq = (list) => { const seen = new Set(); return list.filter((x) => x && !seen.has(x.id) && seen.add(x.id)); };
    /** Découpe la carte selon ses 4 coins (fractions de la photo), remise à plat */
    async function cropToQuad(blob, quad) {
      // un coin hors de la découpe (la case ne contenait pas toute la carte) : on ne recadre pas, sinon les pixels
      // du bord sont étirés pour combler (bandes sur les côtés, vu par Arnaud en v2.33)
      if (quad.some(([x, y]) => x < -0.005 || x > 1.005 || y < -0.005 || y > 1.005)) return null;
      const bmp = await createImageBitmap(blob), W = bmp.width, H = bmp.height;
      const q = quad.map(([x, y]) => [x * W, y * H]);
      const w = Math.round(Math.min(900, Math.max(240, Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]))));
      const cvs = R.warpQuad(bmp, q, w, 0);
      return new Promise((res) => cvs.toBlob(res, 'image/jpeg', 0.92));
    }
    async function visualPass(hint) {
      const V = App.visual;
      if (!V || App.settings.visualCheck === false) return; // (réglage dans Paramètres)
      if (!V.supported()) { S.timing = { ...(S.timing || {}), error: 'pas possible sur ce navigateur' }; return; }
      // (une carte sans aucune piste trouvée par le texte n'est comparée qu'une fois la série connue)
      const all = S.cells.filter((c) => !c.saved && ['sure', 'verifier', 'inconnue'].includes(c.state));
      const todo = all.filter((c) => c.cands.length);
      if (!all.length || (!todo.length && !hint)) return;
      // chronomètre (essai sur téléphone) : visuels officiels à préparer, comparaison, total
      const T = S.timing = { ...(S.timing || {}), refs: 0, match: 0, n: 0, dl: 0, fail: 0, total: null }, tv = performance.now();
      const rank = async (...a) => { const r = await V.rank(...a); T.refs += r.t.refs + r.t.tools; T.match += r.t.match; T.dl += r.t.dl || 0; T.fail += r.t.fail || 0; T.n++; T.backend = r.backend; return r; };
      const byId = new Map();
      const refOf = (x) => { byId.set(x.id, x); return { id: x.id, url: ad.img.card(x, 'low'), set: (x.set && x.set.id) || x.setId }; };
      const st = (t) => { if (alive()) setStatus(`<div class="spinner"></div><div style="text-align:center">${t}</div>`); };
      const pageKey = Date.now(), qid = (c) => `${pageKey}:${c.i}`;
      try {
        for (const [k, c] of todo.entries()) {
          if (S.stopped || !alive()) return;
          st(`Vérification par l'image — carte ${c.i + 1}…`);
          S.prog = { step: 'Vérification par l’image', done: k, total: todo.length, kind: 'img' };
          c.vscan = true; X.drawResults();
          try { c.vis = await rank(qid(c), c.blob, c.cands.map(refOf), { must: c.cands.map((x) => x.id) }); } finally { c.vscan = false; }
        }
        let set = hint || (S.detected && S.detected.id) || null;
        if (!set) {
          const votes = {};
          for (const c of todo) { const t = c.vis.res[0]; const x = t && byId.get(t.id); if (t && t.s >= V.SURE && x && x.set) votes[x.set.id] = (votes[x.set.id] || 0) + 1; }
          const [best, nb] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [];
          if (nb >= 2) set = best;
        }
        if (set) {
          const s = await ad.getSet(set);
          const shape = { id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group };
          const series = s.cards.map((x) => refOf({ ...x, set: shape }));
          for (const [k, c] of all.entries()) {
            if (S.stopped || !alive()) return;
            const own = c.cands.map(refOf), ids = new Set(series.map((r) => r.id));
            st(`Comparaison avec les ${series.length} cartes de ${esc(s.name)} — carte ${c.i + 1}…`);
            S.prog = { step: `Comparaison avec ${s.name}`, done: k, total: all.length, kind: 'img' };
            c.vscan = true; X.drawResults();
            try {
              c.vis = await rank(qid(c), c.blob, [...series, ...own.filter((r) => !ids.has(r.id))], {
                must: c.cands.map((x) => x.id), bonusSet: set,
                onProgress: (d, n) => st(`Préparation des visuels de ${esc(s.name)} (une seule fois) : ${d} / ${n}…`),
              });
            } finally { c.vscan = false; }
          }
        }
        // 3) toute la base (v2.83) : cartes encore douteuses qui ne ressemblent à rien de sûr (autre série que la page,
        //    aucune piste lue…) → le réseau de neurones cherche parmi les ~21 000 cartes (empreintes préparées d'avance),
        //    les 60 plus proches sont vérifiées par les points clés comme d'habitude (mesuré : la bonne carte y est 76 fois sur 90)
        const lost = all.filter((c) => c.state !== 'sure' && !(c.vis && c.vis.best >= V.SURE));
        const sets = new Map(); // séries ouvertes pour retrouver les cartes trouvées (gardées en cache par l'adaptateur)
        const cardIn = async (setId, id) => {
          if (!sets.has(setId)) sets.set(setId, ad.getSet(setId).catch(() => null));
          const s = await sets.get(setId); if (!s) return null;
          const x = s.cards.find((y) => y.id === id); if (!x) return null;
          return { ...x, set: { id: s.id, name: s.name, logo: s.logo, symbol: s.symbol, releaseDate: s.releaseDate, cardCount: { total: s.total, official: s.official }, serie: s.group } };
        };
        for (const [k, c] of lost.entries()) {
          if (S.stopped || !alive()) return;
          st(`Recherche dans toute la base — carte ${c.i + 1}…`);
          S.prog = { step: 'Recherche dans toute la base', done: k, total: lost.length, kind: 'img' };
          c.vscan = true; X.drawResults();
          try {
            const top = await V.global(qid(c), c.blob, 60);
            const refs = top.map((t) => ({ id: t.id, url: t.img + '/low.webp', set: t.set })), ids = new Set(refs.map((r) => r.id));
            const r = await rank(qid(c), c.blob, [...refs, ...c.cands.map(refOf).filter((x) => !ids.has(x.id))], { must: c.cands.map((x) => x.id) });
            if (r.best <= (c.vis ? c.vis.best : 0)) continue;
            // cartes trouvées : retrouvées dans leur série (mêmes informations que les autres propositions)
            const setOf = new Map(top.map((t) => [t.id, t.set]));
            for (const x of r.res.filter((y) => y.s >= r.best * 0.6).slice(0, 4)) {
              if (!byId.has(x.id) && setOf.has(x.id)) { const card = await cardIn(setOf.get(x.id), x.id); if (card) byId.set(x.id, card); }
            }
            c.vis = r; c.visAll = true;
          } catch (e) { console.warn('recherche dans toute la base', e.message); if (/index/.test(e.message)) break; } // (index absent : on n'insiste pas)
          finally { c.vscan = false; }
        }
      } catch (e) { console.warn('vérification par l’image', e); T.error = e.message; T.total = performance.now() - tv; setStatus(''); return; }
      for (const c of all) {
        const [a, b] = c.vis ? c.vis.res : [];
        const card = a && byId.get(a.id);
        if (!card || a.s < V.SURE) continue; // pas assez sûr à l'image : on garde la lecture du texte
        const twin = b && b.s >= a.s * 0.8; // une autre carte presque aussi proche (même dessin : holo / non holo, réimpression)
        const clash = c.state === 'sure' && c.choice && c.choice !== a.id; // le texte avait trouvé autre chose avec certitude
        if (clash) console.info('[image] désaccord case', c.i + 1, c.choice, '→', a.id, a.s);
        // les cartes presque aussi proches à l'image (même dessin) sont proposées juste après
        const near = c.vis.res.slice(1).filter((r) => r.s >= a.s * 0.6).map((r) => byId.get(r.id)).filter(Boolean);
        if (clash) { // on garde le choix du texte, la carte trouvée à l'image est proposée juste après
          const t = c.cands.find((x) => x.id === c.choice);
          c.cands = uniq([t, card, ...near, ...c.cands]).slice(0, 12);
          c.state = 'verifier';
        } else {
          c.cands = uniq([card, ...near, ...c.cands]).slice(0, 12);
          c.choice = a.id; c.state = twin ? 'verifier' : 'sure';
        }
        c.visId = a.id; c.found = Date.now(); // petit éclat : carte confirmée à l’image
        c.checked = c.state === 'sure';
        // la carte recadrée pile sur ses bords : les 4 coins du visuel officiel reportés sur la photo par les points clés
        // (photo enregistrée bien cadrée, et relecture du numéro plus facile)
        if (a.quad && !c.cropped) {
          try {
            // (carte coupée par la grille : ses vrais bords sont cherchés dans la case et ses alentours, v3.02)
            const blob = await cropToQuad(c.blob, a.quad) || (c.ctx && card ? await V.cropOn(c.ctx, card, ad.img.card(card, 'low')).catch(() => null) : null);
            if (blob) { c.gridBlob = c.blob; c.blob = blob; c.url = URL.createObjectURL(blob); urls.push(c.url); c.cropped = true; c.det = null; }
          } catch (e) { console.warn('recadrage', e); }
        }
      }
      // doute qui reste (même dessin, désaccord) : on relit le numéro sur la carte recadrée ; s'il désigne une seule
      // des cartes proches à l'image, c'est elle (ex. holo 12 / non holo 27, Set de Base 37 / Base Set 2 54)
      const doubt = all.filter((c) => c.cropped && c.state === 'verifier');
      for (const [k, c] of doubt.entries()) {
        if (S.stopped || !alive()) return;
        S.prog = { step: 'Relecture du numéro (carte recadrée)', done: k, total: doubt.length, kind: 'img' };
        c.vscan = true; X.drawResults();
        try {
          const info = await R.read(c.blob, null, { atkBand: false });
          const num = info && info.num, a = c.vis.res[0];
          const off = (x) => (x.set && x.set.cardCount && x.set.cardCount.official) || 0;
          const pool = c.vis.res.filter((r) => r.s >= a.s * 0.6).map((r) => byId.get(r.id)).filter(Boolean);
          const hit = num ? pool.filter((x) => parseInt(x.localId, 10) === num.n && (!num.of || !off(x) || off(x) === num.of)) : [];
          if (hit.length === 1) {
            c.cands = uniq([hit[0], ...c.cands]).slice(0, 12);
            c.choice = hit[0].id; c.state = 'sure'; c.checked = true; c.numFix = `${num.n}${num.of ? '/' + num.of : ''}`; c.found = Date.now();
          }
          if (info) c.info = { ...c.info, num: info.num || (c.info && c.info.num) };
        } catch (e) { console.warn('relecture', e); } finally { c.vscan = false; }
      }
      T.total = performance.now() - tv; T.cards = all.length;
      setStatus('');
    }

  return { applySeries, guessSeries, visualPass };
};
