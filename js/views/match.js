/* Page « Combat » (#/combat, ancien « Match ») : combats simplifiés avec tes cartes, contre l'ordinateur (5 niveaux), 3 équipes */
/* (découpée en v3.06 : match-core.js, match-battle.js, match-teams.js, match-duel.js, puis ce fichier, dans cet ordre dans index.html) */
(() => {
  const { esc, B, sleep, adOf, FIGHT_GAMES, lic, say, LAST, lastGame, sideOf, getMatch, saveMatch, teamItems, bagItems, battle, pickTeam, pickBag, renameTeam, startDuel, DKEY, duelSaved, duelResume, duelLobby, duelCreate, duelJoin } = App.matchParts;

  // règles du combat (dépliables en bas des écrans Combat), propres à chaque licence
  const rulesOf = (game) => {
    const li = game === 'onepiece' ? [
      '3 personnages par équipe (Personnages ou Leaders One Piece) : un qui combat, deux sur le banc. Une case vide est remplie par un personnage de prêt.',
      'Ta carte devient un combattant : PV = puissance ÷ 50 (+ contre, + vies du Leader), attaque = puissance ÷ 100, « Riposte » si la carte a un contre, couleur = type ; [Double attaque] = 2 pièces, [Initiative] = 1 DON!! dès le départ. Pas de faiblesse ni de résistance.',
      'À ton tour, ton personnage gagne <b>1 DON!!</b>, puis une action : <b>attaquer</b>, <b>+1 DON!!</b> ou <b>changer</b> de personnage.',
      'Une attaque coûte des DON!! ; ceux en plus restent pour la suite.',
      'Mets K.O. les 3 personnages adverses pour gagner et débloquer le niveau suivant.',
      '<b>Avancé</b> (niveaux à part) : une pioche de 10 cartes Événement / Lieu au plus, plus 3 DON!! (sinon pioche de prêt), mélangée : 3 cartes en main au départ, 1 de plus à chacun de tes tours ; une carte par tour avant l’action. Effets simplifiés : [Contre] +X000 = protection, +X000 de puissance = dégâts en plus, KO = gros coup, renvoyer un personnage = Rafale, piocher = +1 DON!!, Lieu = +10 dégâts 3 tours.',
      'En Avancé, les personnages du banc adverse restent <b>face cachée</b> tant qu’ils n’ont pas combattu (et les tiens pour ton adversaire en ligne).',
    ] : [
      '3 Pokémon par équipe : un qui combat, deux sur le banc. Une case vide est remplie par un Pokémon de prêt.',
      'À ton tour, ton Pokémon gagne <b>1 énergie</b>, puis une action : <b>attaquer</b>, <b>+1 énergie</b> ou <b>changer</b> de Pokémon.',
      'Une attaque coûte 1 énergie par symbole de la carte ; les énergies en plus restent pour la suite.',
      'Dégâts, <b>faiblesse</b> (×2) et <b>résistance</b> de la vraie carte. « 30× » : 30 par face sur 2 pièces ; « 20+ » : bonus si face ; attaque sans dégâts : 10.',
      'Mets K.O. les 3 Pokémon adverses pour gagner et débloquer le niveau suivant.',
      '<b>Avancé</b> (niveaux à part) : une pioche de 10 cartes Dresseur / Énergie au plus (sinon pioche de prêt), mélangée : 3 cartes en main au départ, 1 de plus au début de chacun de tes tours ; une carte par tour avant l’action, chacune une seule fois. Énergie : +1 (+2 si même type). Dresseurs : effet simplifié (Potion soin 20, PlusPower +20 dégâts, Défenseur −20 dégâts subis, Transfert, Rafale de vent…) ; sinon Objet = soin 30, Supporter = +1 énergie, Outil = +20 PV, Stade = +10 dégâts 3 tours.',
      'En Avancé, les Pokémon du banc adverse restent <b>face cachée</b> tant qu’ils n’ont pas combattu (et les tiens pour ton adversaire en ligne).',
    ];
    return `<details class="bt-rules panel"><summary><b>Règles</b></summary><ul class="small">${li.map((x) => `<li>${x}</li>`).join('')}</ul></details>`;
  };
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  App.views.match = {
    async render(el, params, alive) {
      let m = await getMatch();
      const q = params.query || {};
      // v2.99 : d'abord la licence (#/combat), puis son accueil (#/combat?jeu=onepiece) et ses écrans (&ecran=ordi | decks)
      const game = FIGHT_GAMES.includes(q.jeu) ? q.jeu : q.ecran ? lastGame() : '';
      const screen = game && ['ordi', 'decks'].includes(q.ecran) ? q.ecran : ''; // écran : accueil, ordinateur, decks
      if (game) { try { localStorage.setItem(LAST, game); } catch (e) { /* stockage indisponible */ } }
      const LC = lic(game || 'pokemon'), LVS = B().levels(game);
      const url = (ecran) => `#/combat?jeu=${game}${ecran ? `&ecran=${ecran}` : ''}`;
      const S = () => sideOf(m, game);
      let teamsModal = null; // corps de la fenêtre « Mes équipes » (téléphone), s'il est ouvert
      let view = null;       // données de la dernière page dessinée

      const teamCard = (i) => {
        const t = S().teams[i], items = view.teams[i], imgs = view.imgs[i], on = i === S().teamIdx, adv = m.mode === 'adv';
        const bag = view.bags[i];
        return `<div class="bt-tm ${on ? 'on' : ''}">
          <div class="bt-tm-h"><b>${esc(t.name)}</b>${on ? `<span class="bt-tm-on">${App.icons.icon('check', 12)} Pour combattre</span>` : `<button class="btn sm ghost bt-tm-pick" data-sel="${i}">Choisir</button>`}</div>
          <div class="bt-tm-cards">${[0, 1, 2].map((j) => items[j] ? `<img src="${esc(imgs[j].src)}" alt="" title="${esc(items[j].snap.name)}" data-alt="${esc(items[j].snap.name)}">` : '<span class="bt-tm-empty">+</span>').join('')}</div>
          ${adv ? `<div class="bt-tm-bag"><span class="small muted">Pioche : ${bag.length ? plural(bag.length, 'carte') : 'prêt'}</span><span class="bt-tm-bagimgs">${view.bagImgs[i].map((b, j) => `<img src="${esc(b.src)}" alt="" title="${esc(bag[j].snap.name)}">`).join('')}</span></div>` : ''}
          <div class="bt-tm-f"><button class="btn sm" data-edit="${i}">${App.icons.icon('layers', 14)} ${items.length ? 'Modifier' : 'Composer'}</button>${adv ? `<button class="btn sm" data-bag="${i}">Pioche</button>` : ''}<button class="btn sm ghost" data-rename="${i}">Renommer</button></div>
        </div>`;
      };
      const teamsHtml = () => `<div class="bt-teams">${S().teams.map((t, i) => teamCard(i)).join('')}</div>`;

      /** Premier écran : le choix de la licence (chacune a ses decks, ses adversaires et ses salons en ligne) */
      const drawPicker = async () => {
        const rows = await Promise.all(FIGHT_GAMES.map(async (g) => {
          const sd = sideOf(m, g), items = teamItems(sd.teams[sd.teamIdx].keys);
          const imgs = await Promise.all(items.map((it) => App.col.displayImage(it, adOf(it))));
          const st = sd.stats, n = B().levels(g).length;
          return {
            g, imgs, n, w: st.classic.wins + st.adv.wins + st.online.wins, l: st.classic.losses + st.adv.losses + st.online.losses,
            beaten: B().levels(g).filter((L) => sd.beaten[L.n]).length, ready: sd.teams.filter((t) => teamItems(t.keys).length).length,
          };
        }));
        if (!alive()) return;
        const w = rows.reduce((s, r) => s + r.w, 0), l = rows.reduce((s, r) => s + r.l, 0);
        const soon = App.games.list.filter((g) => g.status === 'bientôt').map((g) => g.name);
        el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Combat</div>
          <div class="bt-head"><h1>Combat</h1><span class="muted small">${plural(w, 'victoire')} · ${plural(l, 'défaite')}</span></div>
          <p class="bt-lead">Choisis ta licence : chacune a ses decks, ses adversaires et ses combats en ligne.</p>
          <div class="bt-lics">${rows.map((r) => `<a class="bt-lic-tile g-${r.g}" href="#/combat?jeu=${r.g}">
              <span class="bt-lic-ic">${App.icons.icon(lic(r.g).icon, 24)}</span>
              <span class="bt-lic-t"><b>${esc(lic(r.g).name)}</b><span>${esc(lic(r.g).tag)}</span>
                <small>${r.beaten}/${r.n} niveaux battus · ${plural(r.w, 'victoire')} · ${r.ready}/3 decks prêts</small></span>
              <span class="bt-lic-cards">${[0, 1, 2].map((j) => r.imgs[j] ? `<img src="${esc(r.imgs[j].src)}" alt="">` : '<i></i>').join('')}</span>
              <span class="bt-lic-go">›</span></a>`).join('')}</div>
          ${soon.length ? `<p class="small muted bt-soon">Bientôt : ${esc(soon.join(', '))}.</p>` : ''}`;
      };

      const draw = async () => {
        if (!game) { await drawPicker(); return; }
        const sd = S();
        const teams = sd.teams.map((t) => teamItems(t.keys));
        const bags = sd.teams.map((t) => bagItems(t.bag));
        const [imgs, bagImgs] = await Promise.all([
          Promise.all(teams.map((l) => Promise.all(l.map((it) => App.col.displayImage(it, adOf(it)))))),
          Promise.all(bags.map((l) => Promise.all(l.map((it) => App.col.displayImage(it, adOf(it)))))),
        ]);
        if (!alive()) return;
        view = { teams, bags, imgs, bagImgs };
        const adv = m.mode === 'adv', beaten = adv ? sd.beatenAdv : sd.beaten, st = sd.stats[m.mode];
        const unlocked = (n) => n === 1 || beaten[n - 1];
        const ti = sd.teamIdx, curItems = teams[ti];
        // téléphone : onglets d'équipes + l'équipe choisie
        const mobileTeam = `<section class="bt-mteam">
            <div class="bt-mtabs" role="tablist">${sd.teams.map((t, i) => `<button class="${i === ti ? 'on' : ''}" data-sel="${i}" role="tab">${esc(t.name)}<small>${teams[i].length}/3</small></button>`).join('')}</div>
            <div class="bt-mbody">
              <div class="bt-mcards" data-edit="${ti}">${[0, 1, 2].map((j) => curItems[j] ? `<img src="${esc(imgs[ti][j].src)}" alt="" data-alt="${esc(curItems[j].snap.name)}">` : '<span class="bt-tm-empty">+</span>').join('')}</div>
              <div class="bt-mact">
                <button class="btn sm" data-edit="${ti}">${App.icons.icon('layers', 14)} ${curItems.length ? 'Modifier' : 'Composer'}</button>
                ${adv ? `<button class="btn sm" data-bag="${ti}">Pioche${bags[ti].length ? ` · ${bags[ti].length}` : ''}</button>` : ''}
                <button class="btn sm ghost" data-rename="${ti}">Renommer</button>
              </div>
            </div>
            ${adv ? `<div class="bt-mbag small muted">${bags[ti].length ? `<span class="bt-tm-bagimgs">${bagImgs[ti].map((b) => `<img src="${esc(b.src)}" alt="">`).join('')}</span>` : 'Pioche vide : pioche de prêt'}</div>` : ''}
          </section>`;
        // Trois écrans par licence (accueil, ordinateur, decks) : on choisit d'abord quoi faire,
        // puis contre l'ordinateur : le deck, puis la difficulté, puis le combat.
        const modeTabs = `<div class="bt-modes" role="tablist">
            <button class="${adv ? '' : 'on'}" data-mode="classic" role="tab">Basique</button>
            <button class="${adv ? 'on' : ''}" data-mode="adv" role="tab">Avancé</button>
          </div>
          <p class="bt-hint small muted">${esc(adv ? `Avec une pioche de 10 cartes ${LC.bagKinds} : 3 en main, 1 piochée par tour, une jouée par tour. Le banc adverse reste caché.`
            : say(game, `Tes cartes ${LC.name} seulement, sans pioche.`))}</p>`;
        const hero = (title, crumb) => `<div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/combat">Combat</a> › ${crumb}</div>
          <div class="bt-hero g-${game}">
            <span class="bt-hero-ic">${App.icons.icon(LC.icon, 22)}</span>
            <div class="bt-hero-t"><h1>${title}</h1><span class="small">${esc(LC.name)} · ${esc(LC.tag)}</span></div>
            <a class="bt-hero-sw" href="#/combat">${App.icons.icon('swap', 14)} Licence</a>
          </div>`;
        const beatenN = LVS.filter((L) => beaten[L.n]).length;
        let html;
        if (screen === 'decks') {
          html = `${hero('Mes decks', `<a href="${url()}">${esc(LC.name)}</a> › Mes decks`)}
            ${modeTabs}
            ${mobileTeam}
            <section class="panel bt-team-panel">
              <h2 style="margin:0">Mes decks ${esc(LC.name)}</h2>
              ${teamsHtml()}
            </section>
            <p class="small muted">${esc(say(game, `3 cartes par deck${adv ? `, plus une pioche de 10 cartes ${LC.bagKinds} au plus` : ''}. Une case vide est remplie par un Pokémon de prêt.`))}</p>`;
        } else if (screen === 'ordi') {
          const deckBtn = (i) => {
            const on = i === ti, adv2 = adv && view.bags[i].length;
            return `<div class="bt-deck ${on ? 'on' : ''}" data-sel="${i}" role="radio" aria-checked="${on}">
              <span class="bt-deck-ok">${on ? App.icons.icon('check', 14) : ''}</span>
              <div class="bt-deck-t"><b>${esc(sd.teams[i].name)}</b><span class="small muted">${esc(say(game, teams[i].length ? `${teams[i].length}/3 Pokémon` : 'Pokémon de prêt'))}${adv ? ` · pioche : ${adv2 ? view.bags[i].length : 'prêt'}` : ''}</span></div>
              <div class="bt-deck-cards">${[0, 1, 2].map((j) => teams[i][j] ? `<img src="${esc(imgs[i][j].src)}" alt="" data-alt="${esc(teams[i][j].snap.name)}">` : '<i></i>').join('')}</div>
              <button class="btn sm ghost bt-deck-ed" data-edit="${i}" title="Modifier ce deck">${App.icons.icon('pencil', 14)}</button>
            </div>`;
          };
          html = `${hero('Contre l’ordinateur', `<a href="${url()}">${esc(LC.name)}</a> › Contre l’ordinateur`)}
            <p class="bt-sub muted small">${plural(st.wins, 'victoire')} · ${plural(st.losses, 'défaite')} en ${adv ? 'Avancé' : 'Basique'}</p>
            ${modeTabs}
            <h2 class="bt-step"><span>1</span> Ton deck</h2>
            <div class="bt-decks" role="radiogroup">${sd.teams.map((t, i) => deckBtn(i)).join('')}</div>
            <h2 class="bt-step"><span>2</span> Difficulté</h2>
            <div class="bt-levels">${LVS.map((L) => `<button class="bt-level ${unlocked(L.n) ? '' : 'locked'} ${beaten[L.n] ? 'done' : ''}" data-level="${L.n}" style="--lc:${L.color}" ${unlocked(L.n) ? '' : 'disabled'}>
                <span class="bt-ln">${L.n}</span><div class="bt-ld"><b>${esc(L.name)}</b><span class="small muted">${unlocked(L.n) ? esc(L.desc) + (adv ? ` · pioche de ${App.battleCards.aiBag(L.n, 'fire', game).length}` : '') : `Bats le niveau ${L.n - 1}`}</span></div>
                ${beaten[L.n] ? `<span class="bt-done">${App.icons.icon('check', 14)} Battu</span>` : unlocked(L.n) ? '<span class="btn sm primary">Combattre</span>' : `<span class="bt-lock">${App.icons.icon('lock', 16)}</span>`}</button>`).join('')}</div>
            ${rulesOf(game)}`;
        } else {
          const on = sd.stats.online, tot = { w: sd.stats.classic.wins + sd.stats.adv.wins + on.wins, l: sd.stats.classic.losses + sd.stats.adv.losses + on.losses };
          html = `${hero(`Combat ${esc(LC.name)}`, esc(LC.name))}
            <p class="bt-sub muted small">${plural(tot.w, 'victoire')} · ${plural(tot.l, 'défaite')}</p>
            ${modeTabs}
            <div class="bt-hub">
              <a class="bt-choice" href="${url('ordi')}" style="--cc:#ff7a3d">
                <span class="bt-choice-ic">${App.icons.icon('bolt', 26)}</span>
                <span class="bt-choice-t"><b>Contre l’ordinateur</b><span class="small muted">${esc(LC.foeTag)} · ${beatenN}/${LVS.length} battu${beatenN > 1 ? 's' : ''} en ${adv ? 'Avancé' : 'Basique'}</span></span>
                <span class="bt-choice-go">›</span></a>
              <div class="bt-choice bt-choice-online" style="--cc:#34d5ff">
                <span class="bt-choice-ic">${App.icons.icon('users', 26)}</span>
                <span class="bt-choice-t"><b>En ligne</b><span class="small muted">${on.wins || on.losses ? `${plural(on.wins, 'victoire')} · ${plural(on.losses, 'défaite')} · ` : ''}Crée un salon ${esc(LC.name)} et envoie le code, ou rejoins celui d’un ami. Vous choisissez vos decks une fois dans le salon.</span></span>
                ${App.cloud.user ? `<div class="bt-choice-b"><button class="btn primary" data-duel="create">${App.icons.icon('plus', 15)} Créer un salon</button><button class="btn" data-duel="join">Rejoindre avec un code</button></div>`
                  : `<div class="bt-choice-b"><a class="btn" href="#/connexion">${App.icons.icon('user', 15)} Me connecter pour jouer en ligne</a></div>`}
              </div>
              <a class="bt-choice" href="${url('decks')}" style="--cc:#b08cff">
                <span class="bt-choice-ic">${App.icons.icon('layers', 26)}</span>
                <span class="bt-choice-t"><b>Mes decks</b><span class="small muted">Compose tes 3 decks avec tes cartes ${esc(LC.name)}${adv ? ' (et leur pioche)' : ''} · ${sd.teams.filter((t, i) => teams[i].length).length}/3 prêts</span></span>
                <span class="bt-deck-mini">${[0, 1, 2].map((j) => curItems[j] ? `<img src="${esc(imgs[ti][j].src)}" alt="">` : '<i></i>').join('')}</span>
                <span class="bt-choice-go">›</span></a>
            </div>
            ${rulesOf(game)}`;
        }
        el.innerHTML = `<div class="bt-page g-${game}">${html}</div>`;
        if (teamsModal && document.body.contains(teamsModal)) teamsModal.innerHTML = `<div class="bt-pick"><h2>Mes équipes</h2>${teamsHtml()}</div>`;
      };
      await draw();

      let busy = false;
      /** combat entre amis : créer ou rejoindre un salon, puis noter le résultat (dans la licence du salon) */
      const runDuel = async (how, preset) => {
        if (busy) return;
        if (!App.cloud.user) { location.hash = '#/connexion'; return; }
        busy = true;
        try {
          App.sfx.click();
          m = await getMatch();
          const g0 = game || lastGame();
          let r = how === 'create' ? await duelCreate(m, null, m.mode, g0) : how === 'resume' ? await duelResume(m) : await duelJoin(m, preset, g0);
          // revanche : on enchaîne directement sur le choix des équipes du nouveau salon
          while (r && r.win != null) {
            m = await getMatch();
            const st = sideOf(m, r.game || g0).stats.online;
            if (r.win) st.wins++; else st.losses++;
            await saveMatch(m);
            if (alive()) await draw();
            if (!r.rematch) break;
            App.sfx.click();
            r = await duelLobby(r.rematch, m, r.mode, r.foeName, { game: r.game || g0 });
          }
        } finally { busy = false; }
      };
      /** actions sur les équipes (page ou fenêtre « Mes équipes ») */
      const onTeam = async (e) => {
        const ed = e.target.closest('[data-edit]'), rn = e.target.closest('[data-rename]'), bg = e.target.closest('[data-bag]'), sl = e.target.closest('[data-sel]');
        if (!ed && !rn && !bg && !sl) return false;
        busy = true;
        try {
          if (sl && !ed) { // (le crayon « Modifier » est dans la carte du deck : il passe avant)
            App.sfx.click();
            m = await getMatch(); S().teamIdx = +sl.dataset.sel; await saveMatch(m); await draw();
            return true;
          }
          teamsModal = null; // la fenêtre va être remplacée
          if (ed) {
            const i = +ed.dataset.edit;
            const t = await pickTeam(S().teams[i].keys, S().teams[i].name, game);
            if (t) { m = await getMatch(); S().teams[i].keys = t; S().teamIdx = i; await saveMatch(m); }
          } else if (rn) {
            const i = +rn.dataset.rename;
            const v = await renameTeam(S().teams[i].name);
            if (v) { m = await getMatch(); S().teams[i].name = v.slice(0, 24); await saveMatch(m); }
          } else if (bg) {
            const i = +bg.dataset.bag;
            const b = await pickBag(S().teams[i].bag, S().teams[i].name, game);
            if (b) { m = await getMatch(); S().teams[i].bag = b; await saveMatch(m); }
          }
          await draw();
        } finally { busy = false; }
        return true;
      };

      el.addEventListener('click', async (e) => {
        if (busy || !game) return;
        if (await onTeam(e)) return;
        const md = e.target.closest('[data-mode]');
        if (md) { if (md.dataset.mode !== m.mode) { App.sfx.click(); m = await getMatch(); m.mode = md.dataset.mode; await saveMatch(m); await draw(); } return; }
        if (e.target.closest('[data-teams]')) {
          teamsModal = App.util.openModal(`<div class="bt-pick"><h2>Mes équipes</h2>${teamsHtml()}</div>`, () => { teamsModal = null; });
          const body = teamsModal;
          body.addEventListener('click', async (ev) => { if (!busy) await onTeam(ev); });
          return;
        }
        const du = e.target.closest('[data-duel]');
        if (du) { await runDuel(du.dataset.duel); return; }
        const lv = e.target.closest('[data-level]');
        if (lv && !lv.disabled) {
          busy = true;
          try {
            // le deck est déjà choisi sur cet écran (étape 1) : on lance directement le combat
            let again = true, level = +lv.dataset.level;
            while (again) {
              const t = S().teams[S().teamIdx], adv = m.mode === 'adv';
              const r = await battle(level, teamItems(t.keys), t.name, { adv, bag: bagItems(t.bag), game });
              if (!r) return;
              m = await getMatch();
              const sd = S(), st = sd.stats[adv ? 'adv' : 'classic'];
              if (r.win) { st.wins++; (adv ? sd.beatenAdv : sd.beaten)[level] = true; } else st.losses++;
              if (game === 'pokemon') { if (r.win) m.wins++; else m.losses++; } // (anciens compteurs, pour les anciennes versions)
              await saveMatch(m);
              if (alive()) await draw();
              again = !!r.again;
              if (r.again === 'next') level = Math.min(LVS.length, level + 1); // « Niveau suivant »
            }
          } finally { busy = false; }
        }
      });

      // lien d'un ami (#/combat?salon=CODE) : on propose de rejoindre son salon (dans sa licence)
      if (q.salon) {
        const code = q.salon;
        history.replaceState(history.state, '', location.pathname + location.search + '#/combat');
        for (let i = 0; i < 20 && !App.cloud.user && alive(); i++) await sleep(200); // la connexion se rétablit au démarrage
        if (!alive()) return;
        if (App.cloud.user) runDuel('join', code);
        else App.util.toast('Connecte-toi pour rejoindre ce salon', 4000);
        return;
      }
      // salon en cours (page rafraîchie, appli rouverte) : on y retourne tout seul
      if ((() => { try { return !!localStorage.getItem(DKEY); } catch (e) { return false; } })()) {
        for (let i = 0; i < 20 && !App.cloud.user && alive(); i++) await sleep(200);
        if (alive() && duelSaved()) runDuel('resume');
      }
    },
  };

  // au démarrage de l'appli : un salon en cours ramène sur la page Combat (qui le rouvre)
  let resumeChecked = false;
  App.cloud.on(() => {
    if (resumeChecked || !App.cloud.user) return;
    resumeChecked = true;
    if (duelSaved() && !/^#\/(combat|match)\b/.test(location.hash)) location.hash = '#/combat';
  });
})();
