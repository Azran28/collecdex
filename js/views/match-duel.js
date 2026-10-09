/* Page « Combat » — contre un ami (salon avec code, js/duel.js), reprise d'un combat en cours. Partie de match.js (voir match-core.js). */
(() => {
  const { esc, gameOf, adOf, lic, sideOf, teamItems, bagItems, withDon, myFighters, battle, chooseTeam } = App.matchParts;

  // ---------- Contre un ami (salon avec code, js/duel.js) ----------
  /** Équipe prête à envoyer : mes Pokémon (complétés par des Pokémon de prêt) et mon sac en mode Avancé */
  async function onlineTeam(t, adv, game = 'pokemon') {
    const fs = await myFighters(teamItems(t.keys), game);
    if (!fs.length) throw new Error('cartes introuvables (connexion ?)');
    let bag = [];
    if (adv) {
      const BC = App.battleCards;
      bag = withDon((await Promise.all(bagItems(t.bag).map((it) => adOf(it).getCard(it.id).then((c) => BC.bagCard(c)).catch(() => null)))).filter(Boolean), game);
      if (!bag.length) bag = await BC.loadBag(BC.loanBag(fs[0].type, game), game, { loan: true });
    }
    return { imgs: fs.map((f) => f.img), wire: { name: t.name, fighters: fs.map(App.duel.wireFighter), bag: bag.map(App.duel.wireBag) } };
  }
  /** Lance le combat à partir de l'état du salon (les deux équipes passent par le même filtre : mêmes chiffres des deux côtés) */
  async function startDuel(s, imgs, replay = [], game0 = null) {
    const game = s.game || game0 || 'pokemon';
    const D = App.duel;
    const mine = s.myTeam.fighters, foe = s.foeTeam.fighters;
    if (!mine.length || !foe.length) throw new Error('équipe vide');
    // mes photos à la place des visuels officiels (après un rafraîchissement : retrouvées dans ma collection)
    if (!imgs || !imgs.length) imgs = await Promise.all(mine.map((f) => {
      const it = !f.loan && App.col.all().find((x) => gameOf(x) === game && x.id === f.id && x.qty > 0);
      return it ? App.col.displayImage(it, adOf(it), 'high').then((x) => x.src, () => '') : '';
    }));
    mine.forEach((f, i) => { if (imgs[i]) f.img = imgs[i]; });
    const link = D.link(s.code);
    // chaque coup envoyé est aussi gardé sur ce téléphone : de quoi reprendre le combat après un rafraîchissement
    const rec = { code: s.code, phase: 'play', game, moves: [] };
    duelSave(rec);
    const send0 = link.send;
    link.send = (mv) => { rec.moves.push(mv); duelSave(rec); send0(mv); };
    try {
      return await battle(0, [], s.myTeam.name, {
        adv: s.mode === 'adv', game,
        online: { link, code: s.code, seed: s.seed, rand: D.rng(s.seed), foeName: s.foeName, first: s.meHost === D.hostFirst(s.seed) ? 'P' : 'C', mine, foe, bagP: s.myTeam.bag, bagC: s.foeTeam.bag, replay },
      });
    } finally { duelClear(); }
  }

  // ---------- Salon en cours gardé sur ce téléphone (pour revenir dedans après un rafraîchissement) ----------
  const DKEY = 'collecdex:duel';
  function duelSaved() {
    try {
      const sv = JSON.parse(localStorage.getItem(DKEY) || 'null'), u = App.cloud.user;
      if (!sv || !u || sv.uid !== u.id || !App.duel.CODE.test(sv.code) || Date.now() - (sv.t || 0) > 24 * 3600 * 1000) return null;
      return sv;
    } catch (e) { return null; }
  }
  const duelSave = (o) => { try { localStorage.setItem(DKEY, JSON.stringify({ ...o, uid: App.cloud.user && App.cloud.user.id, t: Date.now() })); } catch (e) { /* stockage indisponible */ } };
  const duelClear = () => { try { localStorage.removeItem(DKEY); } catch (e) { /* idem */ } };

  /** Revenir dans le salon gardé : salle d'attente, choix des équipes ou combat (rejoué en accéléré) */
  async function duelResume(m) {
    const sv = duelSaved(); if (!sv) return null;
    App.util.openModal(App.ui.loading('Retour dans ton salon…'));
    let s;
    try { s = await App.duel.state(sv.code, -1); } catch (e) { App.util.closeModal(); duelClear(); App.util.toast('Ce salon n’existe plus', 3500); return null; }
    App.util.closeModal();
    const g = s.game || sv.game || 'pokemon';
    if (s.status === 'waiting' && s.meHost) return duelCreate(m, s.code, s.mode, g);
    if (s.status === 'lobby') return duelLobby(s.code, m, s.mode, s.foeName, { ready: s.myReady, game: g });
    if (s.status === 'playing' && s.foeTeam && s.myTeam.fighters.length) {
      App.sfx.open(3);
      try { return await startDuel(s, null, sv.phase === 'play' ? sv.moves || [] : [], g); } catch (e) { App.util.toast('Combat impossible : ' + e.message, 4500); return null; }
    }
    duelClear(); App.util.toast('Ce combat est terminé', 3500); return null;
  }
  /** Choix de l'équipe pour un combat entre amis (renvoie l'index, ou null) */
  const modeName = (mode) => (mode === 'adv' ? 'Avancé (avec pioche)' : 'Basique');

  /**
   * Dans le salon, les deux dresseurs sont là : chacun choisit son équipe (sans voir celle de l'autre),
   * puis on attend que l'autre ait choisi ; le combat commence quand les deux sont prêts.
   * Quitter ici ferme le salon (ni victoire ni défaite).
   */
  function duelLobby(code, m, mode, foeName, o = {}) {
    const D = App.duel;
    const game = o.game || 'pokemon', S = sideOf(m, game);
    duelSave({ code, phase: 'lobby', game });
    return new Promise((resolve) => {
      let finished = false, starting = false, team = null, foeReady = false;
      const end = (v) => { if (finished) return; finished = true; stop(); resolve(v); };
      const leave = () => { if (finished || starting) return; D.cancel(code); duelClear(); end(null); };
      const stop = D.waitStart(code, async (s) => {
        if (finished || !team) return;
        starting = true; App.util.closeModal(); App.sfx.open(3);
        try { end(await startDuel(s, team.imgs, [], game)); } catch (e) { duelClear(); App.util.toast('Combat impossible : ' + e.message, 4500); end(null); }
      }, (e) => { if (finished || starting) return; finished = true; duelClear(); App.util.closeModal(); App.util.toast(e.message, 4500); resolve(null); },
      (s) => {
        if (s.foeReady === foeReady) return;
        foeReady = s.foeReady;
        const el = document.getElementById('bt-lobby-foe');
        if (el) el.innerHTML = foeReady ? `<b style="color:var(--ok, #3ddc97)">${esc(foeName)} a choisi son équipe ✓</b>` : `${esc(foeName)} choisit son équipe…`;
      });
      (async () => {
        let teamName = '';
        if (o.ready) team = { imgs: [] }; // reprise : mon équipe est déjà envoyée (mes photos seront retrouvées au début du combat)
        else {
          const idx = await chooseTeam(m, {
            title: 'Choisis ton équipe',
            sub: `Salon ${code} · ${esc(lic(game).name)} · contre <b>${esc(foeName)}</b> · mode ${esc(modeName(mode))}. ${esc(foeName)} ne verra ton équipe qu’au début du combat.`, game,
          });
          if (finished) return;
          if (idx == null) { leave(); return; }
          App.util.openModal(App.ui.loading('Préparation de ton équipe…'), leave);
          try { team = await onlineTeam(S.teams[idx], mode === 'adv', game); if (!finished) await D.setTeam(code, team.wire); }
          catch (e) { if (finished || starting) return; App.util.closeModal(); App.util.toast('Équipe impossible : ' + e.message, 4500); D.cancel(code); duelClear(); end(null); return; }
          teamName = S.teams[idx].name;
        }
        if (finished || starting) return;
        App.util.openModal(`<div class="bt-pick bt-room">
            <h2>${App.icons.icon('users', 18)} Salon ${esc(code)}</h2>
            <p class="small muted" style="margin:2px 0 12px">${esc(lic(game).name)} · mode ${esc(modeName(mode))}</p>
            <p style="margin:0 0 6px"><b style="color:var(--ok, #3ddc97)">${App.icons.icon('check', 14)} ${teamName ? `Ton équipe « ${esc(teamName)} » est prête` : 'Ton équipe est prête'}</b></p>
            <div class="bt-wait" style="justify-content:center"><span class="bt-wait-dots"><i></i><i></i><i></i></span> <span id="bt-lobby-foe">${foeReady ? `${esc(foeName)} a choisi son équipe ✓` : `${esc(foeName)} choisit son équipe…`}</span></div>
            <div class="row" style="justify-content:center;margin-top:8px"><button class="btn ghost sm" id="bt-lobby-quit">Quitter le salon</button></div>
          </div>`, leave);
        document.getElementById('bt-lobby-quit').addEventListener('click', () => { leave(); App.util.closeModal(); });
      })();
    });
  }

  /** Créer un salon : montre le code, attend l'ami, puis lance le combat */
  async function duelCreate(m, existing = null, mode = m.mode, game = 'pokemon') {
    const D = App.duel;
    let body, code = existing;
    if (!code) {
      body = App.util.openModal(App.ui.loading('Préparation du salon…'));
      try { code = await D.create(mode, null, game); }
      catch (e) { App.util.closeModal(); App.util.toast('Salon impossible : ' + e.message, 4500); return null; }
    }
    duelSave({ code, phase: 'room', game });
    const link = `${location.origin}${location.pathname}#/combat?salon=${code}`;
    return new Promise((resolve) => {
      let done = false, stop = null;
      const end = (v) => { if (done) return; done = true; if (stop) stop(); resolve(v); };
      body = App.util.openModal(`<div class="bt-pick bt-room">
          <h2>${App.icons.icon('users', 18)} Ton salon</h2>
          <p class="small muted" style="margin:2px 0 10px">${esc(lic(game).name)} · mode ${esc(modeName(mode))} · vous choisirez vos équipes une fois ensemble dans le salon</p>
          <button type="button" class="bt-code" id="bt-room-code" title="Copier le code" aria-label="Code du salon : toucher pour le copier">${code.split("").map((c) => `<span>${esc(c)}</span>`).join("")}</button>
          <div class="bt-code-hint small muted" id="bt-code-hint">Touche le code pour le copier</div>
          <p class="small" style="text-align:center;margin:10px 0">Donne ce code à ton adversaire : page <b>Combat</b> › « Rejoindre avec un code ». Il lui faut juste un compte CollecDex.</p>
          <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn" id="bt-room-copy">${App.icons.icon("copy", 15)} Copier le code</button><button class="btn primary" id="bt-room-share">${App.icons.icon("share", 15)} ${navigator.share ? "Envoyer" : "Copier le lien"}</button></div>
          <div class="bt-wait" style="justify-content:center;margin-top:14px"><span class="bt-wait-dots"><i></i><i></i><i></i></span> En attente de ton adversaire…</div>
          <div class="row" style="justify-content:center;margin-top:8px"><button class="btn ghost sm" id="bt-room-cancel">Fermer le salon</button></div>
        </div>`, () => { if (!done) { D.cancel(code); duelClear(); end(null); } });
      // copier le code seul (toucher le code ou le bouton) : presse-papiers, sinon ancienne méthode (vieux navigateurs, page non sécurisée)
      const copyCode = async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
          const t = document.createElement('textarea'); t.value = code; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
          document.body.appendChild(t); t.select(); t.setSelectionRange(0, code.length);
          try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
          t.remove();
        }
        const hint = body.querySelector('#bt-code-hint'), box = body.querySelector('#bt-room-code');
        if (hint) hint.innerHTML = ok ? `<b style="color:var(--ok, #3ddc97)">${App.icons.icon('check', 13)} Code copié : colle-le dans un message</b>` : 'Copie impossible : recopie le code à la main';
        if (ok && box) { box.classList.remove('copied'); void box.offsetWidth; box.classList.add('copied'); App.sfx.click(); }
      };
      body.querySelector('#bt-room-code').addEventListener('click', copyCode);
      body.querySelector('#bt-room-copy').addEventListener('click', copyCode);
      body.querySelector('#bt-room-share').addEventListener('click', async () => {
        const text = `Viens m’affronter sur CollecDex (${lic(game).name}) ! Code du salon : ${code}`;
        if (navigator.share) { navigator.share({ title: 'Combat CollecDex', text, url: link }).catch(() => {}); return; }
        try { await navigator.clipboard.writeText(`${text}\n${link}`); App.util.toast('Lien copié ✓'); } catch (e) { App.util.toast(code); }
      });
      body.querySelector('#bt-room-cancel').addEventListener('click', () => { D.cancel(code); duelClear(); end(null); App.util.closeModal(); });
      stop = D.waitJoin(code, async (s) => {
        if (done) return;
        done = true; App.util.closeModal(); App.sfx.click();
        App.util.toast(`${s.foeName} est dans le salon !`);
        resolve(await duelLobby(code, m, mode, s.foeName, { game: s.game || game }));
      }, (e) => { if (!done) { duelClear(); App.util.closeModal(); App.util.toast(e.message, 4500); end(null); } });
    });
  }

  /** Rejoindre le salon d'un ami avec son code */
  async function duelJoin(m, preset = '', pageGame = 'pokemon') {
    const D = App.duel;
    const code = await new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      const body = App.util.openModal(`<div class="bt-pick bt-room">
          <h2>${App.icons.icon('users', 18)} Rejoindre un salon</h2>
          <p class="small muted" style="margin:2px 0 10px">Entre le code à 6 caractères que ton adversaire t’a donné.</p>
          <input type="text" id="bt-code-in" class="bt-code-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" value="${esc(D.pickCode(preset))}">
          <div class="small" id="bt-code-msg" style="min-height:1.3em;margin-top:6px;text-align:center"></div>
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn ghost" data-close>Annuler</button><button class="btn primary" id="bt-code-ok">Rejoindre</button></div>
        </div>`, () => end(null));
      const inp = body.querySelector('#bt-code-in'), msg = body.querySelector('#bt-code-msg');
      setTimeout(() => inp.focus(), 50);
      inp.addEventListener('input', () => { const v = D.pickCode(inp.value); if (v !== inp.value) inp.value = v; msg.textContent = ''; });
      const ok = async () => {
        const v = D.normCode(inp.value);
        if (!D.CODE.test(v)) { msg.innerHTML = '<span style="color:#ff8a8a">Le code fait 6 caractères (lettres et chiffres)</span>'; return; }
        msg.textContent = 'Recherche du salon…';
        try { const info = await D.peek(v); end({ code: v, ...info }); App.util.closeModal(); }
        catch (e) { msg.innerHTML = `<span style="color:#ff8a8a">${esc(e.message)}</span>`; }
      };
      body.querySelector('#bt-code-ok').addEventListener('click', ok);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
    if (!code) return null;
    // on entre dans le salon, puis chacun choisit son équipe (pour le mode du salon, celui de l'ami qui l'a créé)
    App.util.openModal(App.ui.loading(`Connexion au salon de ${esc(code.host)}…`));
    try { await D.join(code.code); }
    catch (e) { App.util.closeModal(); App.util.toast('Impossible de rejoindre : ' + e.message, 4500); return null; }
    App.util.closeModal(); App.sfx.click();
    return duelLobby(code.code, m, code.mode, code.host, { game: code.game || pageGame });
  }

  App._duelTest = { startDuel }; // pour les tests (deux combats simulés dans la même page)

  Object.assign(App.matchParts, { onlineTeam, startDuel, DKEY, duelSaved, duelSave, duelClear, duelResume, modeName, duelLobby, duelCreate, duelJoin });
})();
