/* Page « Match » : combats simplifiés avec tes cartes, contre l'ordinateur (4 niveaux) */
(() => {
  const { esc } = App.util;
  const B = () => App.battle;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ad = () => App.games.get('pokemon');

  // ---------- Données ----------
  async function getMatch() { const p = await App.col.getProfile(); return Object.assign({ team: [], beaten: {}, wins: 0, losses: 0 }, p.match || {}); }
  async function saveMatch(m) { const p = await App.col.getProfile(); p.match = m; await App.col.saveProfile(p); }

  /** Tes cartes Pokémon (d'après les listes des séries, gardées en cache) */
  async function myPokemon() {
    const items = App.col.all().filter((i) => i.qty > 0 && i.game === 'pokemon');
    const bySet = {};
    for (const it of items) (bySet[it.setId] = bySet[it.setId] || []).push(it);
    const out = [];
    await App.util.pool(Object.keys(bySet), 4, async (sid) => {
      const set = await ad().getSet(sid).catch(() => null);
      const cat = new Map((set ? set.cards : []).map((c) => [c.id, c.category]));
      for (const it of bySet[sid]) { const c = cat.get(it.id); if (!c || /pok/i.test(c)) out.push(it); } // catégorie inconnue : on tente
    });
    return out.sort((a, b) => App.col.valueOf(b) - App.col.valueOf(a));
  }

  async function fromItem(it) {
    const card = await ad().getCard(it.id);
    if (!/pok/i.test(card.category || 'Pokémon') || !card.hp) return null;
    const img = await App.col.displayImage(it, ad(), 'high');
    return B().fighter(card, { img: img.src, mine: true });
  }
  async function fromId(id, extra = {}) {
    const card = await ad().getCard(id);
    return B().fighter(card, { img: card.image ? `${card.image}/high.webp` : '', ...extra });
  }
  const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  // ---------- Morceaux d'interface ----------
  const typeChip = (t) => { const [n, c] = B().TYPE_INFO[t] || ['?', '#999']; return `<span class="bt-type" style="--tc:${c}">${esc(n)}</span>`; };
  const pips = (n) => `<span class="bt-pips" title="${n} énergie${n > 1 ? 's' : ''}">${Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('')}${n > 8 ? `<b>+${n - 8}</b>` : ''}</span>`;
  const costPips = (n) => (n ? Array.from({ length: n }, () => '<i></i>').join('') : '<small>0</small>');

  // ---------- Écran de combat ----------
  async function battle(level, teamItems) {
    const ov = document.createElement('div');
    ov.className = 'bt-ov';
    ov.innerHTML = `<div class="bt-load">${App.ui.loading('Préparation du combat…')}</div>`;
    document.body.appendChild(ov); document.body.classList.add('cap-lock');
    const close = () => { ov.remove(); document.body.classList.remove('cap-lock'); };
    const L = B().LEVELS[level - 1];

    // équipes
    let mine = [], foe = [];
    try {
      mine = (await Promise.all(teamItems.map((it) => fromItem(it).catch(() => null)))).filter(Boolean);
      const loan = pick(B().LEVELS[0].pool, 6);
      while (mine.length < 3 && loan.length) { const f = await fromId(loan.shift(), { loan: true }).catch(() => null); if (f) mine.push(f); }
      foe = (await Promise.all(pick(L.pool, L.strong ? 8 : 5).map((id) => fromId(id).catch(() => null)))).filter(Boolean);
      foe = (L.strong ? foe.sort((a, b) => B().power(b) - B().power(a)) : foe).slice(0, 3);
      if (foe.length < 3 || mine.length < 1) throw new Error('cartes introuvables (connexion ?)');
    } catch (e) { close(); App.util.toast('Combat impossible : ' + e.message, 4000); return null; }
    if (L.bonus) foe.forEach((f) => { f.energy += L.bonus; });

    const P = { team: mine, active: 0 }, C = { team: foe, active: 0 };
    let over = false, turn = 0, quit = false;

    ov.innerHTML = `
      <div class="bt-top"><span class="bt-lvl" style="--lc:${L.color}">Niveau ${L.n} · ${esc(L.name)}</span><span class="spacer"></span><button class="btn sm ghost" data-quit>Abandonner</button></div>
      <div class="bt-arena">
        <div class="bt-side foe"><div class="bt-bench" data-side="C"></div><div class="bt-active" data-side="C"></div></div>
        <div class="bt-log" aria-live="polite"></div>
        <div class="bt-side me"><div class="bt-active" data-side="P"></div><div class="bt-bench" data-side="P"></div></div>
      </div>
      <div class="bt-actions"></div>
      <div class="bt-banner"></div>`;
    const $ = (s) => ov.querySelector(s);
    const log = (h) => { $('.bt-log').innerHTML = h; };
    const keyOf = (side) => (side === P ? 'P' : 'C');

    const drawActive = (side) => {
      const f = B().active(side), key = keyOf(side);
      const r = f.hp / f.maxHp;
      ov.querySelector(`.bt-active[data-side="${key}"]`).innerHTML = `<div class="bt-card ${f.ko ? 'ko' : ''}" data-uid="${f.uid}">
          <div class="bt-img"><img src="${esc(f.img)}" alt="${esc(f.name)}" data-alt="${esc(f.name)}"></div>
          <div class="bt-info"><div class="bt-name"><b>${esc(f.name)}</b>${typeChip(f.type)}${f.loan ? '<span class="bt-loan">prêt</span>' : ''}</div>
            <div class="bt-hp"><span style="width:${Math.max(0, r * 100)}%" class="${r < 0.3 ? 'low' : r < 0.6 ? 'mid' : ''}"></span></div>
            <div class="bt-stats"><span>${Math.max(0, f.hp)} / ${f.maxHp} PV</span>${pips(f.energy)}</div></div></div>`;
    };
    const drawBench = (side) => {
      const key = keyOf(side);
      ov.querySelector(`.bt-bench[data-side="${key}"]`).innerHTML = side.team.map((f, i) => `<button class="bt-mini ${i === side.active ? 'on' : ''} ${f.ko ? 'ko' : ''}" data-bench="${key}" data-i="${i}" title="${esc(f.name)} (${Math.max(0, f.hp)} PV)" ${key === 'C' ? 'tabindex="-1"' : ''}>
        <img src="${esc(f.img)}" alt="" data-alt="${esc(f.name)}"><span class="bt-mhp"><span style="width:${Math.max(0, (f.hp / f.maxHp) * 100)}%"></span></span></button>`).join('');
    };
    const drawAll = () => { drawActive(C); drawActive(P); drawBench(C); drawBench(P); };

    const banner = async (txt, cls = '') => { const b = $('.bt-banner'); b.className = 'bt-banner show ' + cls; b.textContent = txt; await sleep(850); b.className = 'bt-banner'; };
    const cardEl = (f) => ov.querySelector(`.bt-card[data-uid="${f.uid}"]`);
    const floatTxt = (f, txt, cls) => { const c = cardEl(f); if (!c) return; const d = document.createElement('div'); d.className = 'bt-float ' + (cls || ''); d.textContent = txt; c.appendChild(d); setTimeout(() => d.remove(), 1300); };

    /** Une attaque, avec son animation */
    async function doAttack(side, other, i) {
      const a = B().active(side), d = B().active(other), att = a.attacks[i];
      const r = B().damage(att, a, d);
      a.energy = 0; // l'attaque utilise toutes les énergies (règle simplifiée)
      const ac = cardEl(a);
      if (ac) { ac.classList.remove('lunge-up', 'lunge-down'); void ac.offsetWidth; ac.classList.add(side === P ? 'lunge-up' : 'lunge-down'); }
      await sleep(260);
      d.hp = Math.max(0, d.hp - r.dmg);
      App.sfx.hit(r.dmg >= 80 || r.weak);
      const dc = cardEl(d); if (dc && r.dmg > 0) { dc.classList.remove('hit'); void dc.offsetWidth; dc.classList.add('hit'); }
      floatTxt(d, r.dmg ? `−${r.dmg}` : 'Raté !', r.weak ? 'weak' : r.dmg ? '' : 'miss');
      const coinTxt = r.coins ? ` <span class="bt-coins">${r.coins.map((c) => (c ? '🟡 face' : '⚪ pile')).join(' · ')}</span>` : '';
      log(`<b>${esc(a.name)}</b> utilise <b>${esc(att.name)}</b> : ${r.dmg} dégâts${r.weak ? ' <span class="bt-eff">Super efficace !</span>' : ''}${r.resist ? ' <span class="muted">(résistance)</span>' : ''}${coinTxt}`);
      await sleep(220);
      drawActive(other); drawBench(other);
      const ac2 = cardEl(a); if (ac2) ac2.querySelector('.bt-pips').outerHTML = pips(0);
      await sleep(750);
      if (d.hp <= 0) {
        d.ko = true; App.sfx.ko();
        drawActive(other); drawBench(other);
        log(`<b>${esc(d.name)}</b> est K.O. !`);
        await sleep(950);
      }
    }

    /** Actions du joueur : on attend son choix */
    const playerChoice = () => new Promise((resolve) => {
      const a = B().active(P), foeA = B().active(C);
      const canSwitch = B().bench(P).length > 0;
      $('.bt-actions').innerHTML = `<div class="bt-atks">${a.attacks.map((x, i) => {
        const ok = x.cost <= a.energy, exp = Math.round(B().expected(x, a, foeA));
        return `<button class="bt-atk ${ok ? '' : 'off'}" data-atk="${i}" ${ok ? '' : 'disabled'} title="${esc(x.text)}">
          <span class="bt-cost">${costPips(x.cost)}</span><b>${esc(x.name)}</b><span class="bt-dmg">${x.noDamage ? '10' : x.base + (x.mode === 'x' ? '×' : x.mode === '+' ? '+' : '')}${exp > x.base * 1.4 ? ' <em>×2</em>' : ''}</span></button>`;
      }).join('')}</div>
        <div class="bt-more"><button class="btn" data-charge>${App.icons.icon('bolt', 16)} Charger <small>+1</small></button>
          <button class="btn ghost" data-switch ${canSwitch ? '' : 'disabled'}>${App.icons.icon('swap', 16)} Changer</button></div>`;
      const done = (v) => { ov.removeEventListener('click', h); $('.bt-actions').innerHTML = ''; ov.classList.remove('pick-bench'); resolve(v); };
      const h = (e) => {
        if (over) return;
        const at = e.target.closest('[data-atk]'); if (at && !at.disabled) { done({ type: 'attack', i: +at.dataset.atk }); return; }
        if (e.target.closest('[data-charge]')) { done({ type: 'charge' }); return; }
        if (e.target.closest('[data-switch]') && canSwitch) { log('Choisis le Pokémon à envoyer (touche-le en bas).'); ov.classList.add('pick-bench'); return; }
        const bb = e.target.closest('[data-bench="P"]');
        if (bb && ov.classList.contains('pick-bench')) {
          const i = +bb.dataset.i; if (i === P.active || P.team[i].ko) return;
          done({ type: 'switch', to: i });
        }
      };
      ov.addEventListener('click', h);
    });
    /** Remplaçant après un K.O. (le joueur choisit) */
    const playerReplace = () => new Promise((resolve) => {
      log('Ton Pokémon est K.O. : touche le suivant en bas.');
      ov.classList.add('pick-bench');
      const h = (e) => {
        const bb = e.target.closest('[data-bench="P"]'); if (!bb) return;
        const i = +bb.dataset.i; if (P.team[i].ko) return;
        ov.removeEventListener('click', h); ov.classList.remove('pick-bench'); resolve(i);
      };
      ov.addEventListener('click', h);
    });

    const gain = (side) => { const f = B().active(side); f.energy += 1; App.sfx.energy(); drawActive(side); const c = cardEl(f); if (c) { const p = c.querySelector('.bt-pips i:last-child'); if (p) p.classList.add('new'); } };

    let resolveEnd;
    const ended = new Promise((r) => { resolveEnd = r; });
    function finish(win) {
      over = true;
      $('.bt-actions').innerHTML = '';
      const b = document.createElement('div');
      b.className = 'bt-end ' + (win ? 'win' : 'lose');
      b.innerHTML = `<div class="bt-end-box"><div class="bt-end-t">${win ? 'Victoire !' : 'Défaite…'}</div>
        <p>${win ? `Tu as battu le niveau ${L.n} · ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''}.${L.n < B().LEVELS.length ? ' Le niveau suivant est débloqué !' : ' Tu es une vraie Légende !'}` : quit ? 'Tu as abandonné. Retente ta chance !' : 'L’ordinateur a gagné cette fois. Change d’équipe ou charge tes attaques plus tôt !'}</p>
        <div class="row" style="justify-content:center;gap:8px"><button class="btn primary" data-again>Rejouer</button><button class="btn ghost" data-close>Retour</button></div></div>`;
      ov.appendChild(b);
      if (win) App.sfx.open(L.n >= 3 ? 5 : 3); else App.sfx.lose();
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-again]')) { close(); resolveEnd({ win, again: true }); }
        if (e.target.closest('[data-close]')) { close(); resolveEnd({ win, again: false }); }
      });
    }
    ov.querySelector('[data-quit]').addEventListener('click', () => { if (!over && confirm('Abandonner le combat ? (ça compte comme une défaite)')) { quit = true; finish(false); } });

    drawAll();
    log(`Le combat commence ! <b>${esc(B().active(P).name)}</b> contre <b>${esc(B().active(C).name)}</b>.`);
    App.sfx.unlock();
    await sleep(600);

    // ---------- les tours ----------
    (async () => {
      while (!over) {
        turn++;
        await banner('À toi !', 'me');
        if (over) break;
        gain(P);
        const act = await playerChoice();
        if (over) break;
        if (act.type === 'attack') await doAttack(P, C, act.i);
        else if (act.type === 'charge') { gain(P); log(`<b>${esc(B().active(P).name)}</b> se concentre : +1 énergie.`); await sleep(550); }
        else { P.active = act.to; drawAll(); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(600); }
        if (over) break;
        if (B().active(C).ko) {
          if (!B().alive(C).length) { finish(true); break; }
          C.active = B().aiReplace(C, P, L.n); drawAll(); log(`L’ordinateur envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(850);
        }
        if (over) break;
        await banner('Tour de l’ordinateur', 'foe');
        if (over) break;
        gain(C);
        await sleep(550);
        const mv = B().aiMove(C, P, L.n);
        if (over) break;
        if (mv.type === 'attack') await doAttack(C, P, mv.i);
        else if (mv.type === 'charge') { gain(C); log(`<b>${esc(B().active(C).name)}</b> se concentre : +1 énergie.`); await sleep(650); }
        else { C.active = mv.to; drawAll(); log(`L’ordinateur rappelle son Pokémon et envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(850); }
        if (over) break;
        if (B().active(P).ko) {
          if (!B().alive(P).length) { finish(false); break; }
          drawAll();
          P.active = await playerReplace(); drawAll(); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(500);
        }
      }
    })();

    return ended;
  }

  // ---------- Choix de l'équipe ----------
  async function pickTeam(current) {
    const body = App.util.openModal(App.ui.loading('Recherche de tes Pokémon…'));
    const list = await myPokemon();
    const sel = current.filter((k) => list.some((i) => i.key === k)).slice(0, 3);
    const imgs = await Promise.all(list.map((it) => App.col.displayImage(it, ad())));
    return new Promise((resolve) => {
      let q = '';
      const filter = () => { const v = App.util.norm(q); body.querySelectorAll('.bt-pk').forEach((c) => { c.hidden = !!v && !c.dataset.q.includes(v); }); };
      const draw = () => {
        body.innerHTML = `<div class="bt-pick"><h2>Ton équipe <span class="muted small">${sel.length}/3</span></h2>
          ${list.length ? `<p class="small muted">Choisis 3 Pokémon de ta collection, dans l’ordre (le 1er commence le combat).${list.length < 3 ? ' Il t’en manque : des Pokémon de prêt compléteront ton équipe.' : ''}</p>
            <input type="search" id="bt-q" placeholder="Rechercher…" value="${esc(q)}">
            <div class="bt-pick-grid">${list.map((it, i) => { const n = sel.indexOf(it.key); return `<button class="bt-pk ${n >= 0 ? 'on' : ''}" data-k="${esc(it.key)}" data-q="${esc(App.util.norm(it.snap.name))}">${n >= 0 ? `<span class="n">${n + 1}</span>` : ''}<img src="${esc(imgs[i].src)}" alt="" loading="lazy" data-alt="${esc(it.snap.name)}"><span>${esc(it.snap.name)}</span></button>`; }).join('')}</div>`
            : '<p class="muted">Tu n’as pas encore de carte Pokémon dans ton Dex : tu joueras avec des Pokémon de prêt. Capture tes cartes pour jouer avec elles !</p>'}
          <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn primary" id="bt-ok">Valider</button></div></div>`;
        filter();
      };
      draw();
      body.addEventListener('click', (e) => {
        const k = e.target.closest('[data-k]');
        if (k) { const key = k.dataset.k; const i = sel.indexOf(key); if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(key); else App.util.toast('3 Pokémon maximum'); draw(); return; }
        if (e.target.closest('#bt-ok')) { App.util.closeModal(); resolve([...sel]); }
      });
      body.addEventListener('input', (e) => { if (e.target.id === 'bt-q') { q = e.target.value; filter(); } });
    });
  }

  App.views.match = {
    async render(el, params, alive) {
      let m = await getMatch();
      const draw = async () => {
        const team = m.team.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);
        const imgs = await Promise.all(team.map((it) => App.col.displayImage(it, ad())));
        if (!alive()) return;
        const unlocked = (n) => n === 1 || m.beaten[n - 1];
        el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Match</div>
          <div class="row" style="align-items:baseline;gap:12px"><h1 style="margin:0">Match</h1><span class="muted small">${m.wins} victoire${m.wins > 1 ? 's' : ''} · ${m.losses} défaite${m.losses > 1 ? 's' : ''}</span></div>
          <p class="muted" style="margin-top:6px">Tes cartes deviennent jouables : forme une équipe de 3 Pokémon de ta collection et affronte l’ordinateur. Les combats contre tes amis viendront plus tard.</p>
          <section class="panel bt-team-panel">
            <div class="row"><h2 style="margin:0">Ton équipe</h2><span class="spacer"></span><button class="btn sm" data-team>${App.icons.icon('layers', 14)} ${team.length ? 'Changer' : 'Choisir mon équipe'}</button></div>
            <div class="bt-team">${[0, 1, 2].map((i) => team[i] ? `<button class="bt-slot" data-team><img src="${esc(imgs[i].src)}" alt="" data-alt="${esc(team[i].snap.name)}"><span>${esc(team[i].snap.name)}</span></button>`
              : `<button class="bt-slot empty" data-team><b>+</b><small>Pokémon de prêt si vide</small></button>`).join('')}</div>
          </section>
          <h2>Adversaire</h2>
          <div class="bt-levels">${B().LEVELS.map((L) => `<button class="bt-level ${unlocked(L.n) ? '' : 'locked'} ${m.beaten[L.n] ? 'done' : ''}" data-level="${L.n}" style="--lc:${L.color}" ${unlocked(L.n) ? '' : 'disabled'}>
              <span class="bt-ln">${L.n}</span><div class="bt-ld"><b>${esc(L.name)}</b><span class="small muted">${unlocked(L.n) ? esc(L.desc) : `Bats le niveau ${L.n - 1} pour le débloquer`}</span></div>
              ${m.beaten[L.n] ? `<span class="bt-done">${App.icons.icon('check', 14)} Battu</span>` : unlocked(L.n) ? '<span class="btn sm primary">Combattre</span>' : `<span class="bt-lock">${App.icons.icon('lock', 16)}</span>`}</button>`).join('')}</div>
          <details class="bt-rules panel"><summary><b>Règles du combat</b> (version simplifiée)</summary>
            <ul class="small">
              <li>Chaque équipe a 3 Pokémon : un qui combat, les deux autres attendent sur le banc.</li>
              <li>Au début de ton tour, ton Pokémon gagne <b>1 énergie</b>. Puis une seule action : <b>attaquer</b>, <b>charger</b> (+1 énergie en plus) ou <b>changer</b> de Pokémon.</li>
              <li>Une attaque coûte 1 énergie par symbole indiqué sur la carte, et utilise toutes les énergies du Pokémon.</li>
              <li>Dégâts de la carte, avec la <b>faiblesse</b> (×2) et la <b>résistance</b>. « 30× » : 30 par face sur 2 pièces ; « 20+ » : bonus si face. Une attaque qui n’a qu’un effet fait 10 dégâts.</li>
              <li>Mets K.O. les 3 Pokémon de l’ordinateur pour gagner et débloquer le niveau suivant.</li>
            </ul></details>`;
      };
      await draw();

      el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-team]')) {
          const t = await pickTeam(m.team);
          m = await getMatch(); m.team = t; await saveMatch(m); await draw(); return;
        }
        const lv = e.target.closest('[data-level]');
        if (lv && !lv.disabled) {
          let again = true;
          while (again) {
            const team = m.team.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);
            const r = await battle(+lv.dataset.level, team);
            if (!r) return;
            m = await getMatch();
            if (r.win) { m.wins++; m.beaten[+lv.dataset.level] = true; } else m.losses++;
            await saveMatch(m);
            if (alive()) await draw();
            again = r.again;
          }
        }
      });
    },
  };
})();
