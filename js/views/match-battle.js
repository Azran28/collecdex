/* Page « Combat » — écran de combat (contre l'ordinateur ou un ami). Partie de match.js (voir match-core.js). */
(() => {
  const { esc, B, isFast, setFast, sleep, adOf, FIGHT_GAMES, RM, lic, BAG_ICON, say, fromId, withDon, myFighters, pick, typeColor, typeChip, pips, costPips, hpCls } = App.matchParts;

  // ---------- Écran de combat ----------
  /**
   * Combat. Contre l'ordinateur (level 1…5), ou contre un ami (opts.online = { link, rand, foeName, first: 'P'|'C', mine, foe, bagP, bagC }) :
   * les décisions de l'adversaire arrivent alors par link.next() au lieu de l'IA, et les miennes partent par link.send().
   */
  async function battle(level, teamItemsList, teamName, opts = {}) {
    const ADV = !!opts.adv, BC = App.battleCards, ON = opts.online || null;
    const GAME = FIGHT_GAMES.includes(opts.game) ? opts.game : 'pokemon', LC = lic(GAME), T = (s) => say(GAME, s);
    const LVS = B().levels(GAME);
    const ov = document.createElement('div');
    ov.className = `bt-ov g-${GAME}` + (ADV ? ' adv' : '') + (ON ? ' online' : '') + (!ON && level >= LVS.length ? ' boss' : '');
    ov.innerHTML = `<div class="bt-bg" aria-hidden="true"></div><div class="bt-load">${App.ui.loading('Préparation du combat…')}</div>`;
    document.body.appendChild(ov); document.body.classList.add('cap-lock');
    const close = () => { setFast(false); App.sfx.quiet(false); ov.remove(); document.body.classList.remove('cap-lock'); if (ON) ON.link.close(); };
    const L = ON ? { n: 0, name: ON.foeName, color: '#34d5ff' } : LVS[level - 1];
    const rnd = ON ? ON.rand : Math.random;
    const foeWho = ON ? ON.foeName : 'L’ordinateur';

    // équipes
    let mine = [], foe = [];
    if (ON) { mine = ON.mine; foe = ON.foe; }
    else try {
      mine = await myFighters(teamItemsList, GAME);
      foe = (await Promise.all(pick(L.pool, L.strong ? 8 : 5).map((id) => fromId(id, {}, GAME).catch(() => null)))).filter(Boolean);
      foe = (L.strong ? foe.sort((a, b) => B().power(b) - B().power(a)) : foe).slice(0, 3);
      if (foe.length < 3 || mine.length < 1) throw new Error('cartes introuvables (connexion ?)');
    } catch (e) { close(); App.util.toast('Combat impossible : ' + e.message, 4000); return null; }
    if (L.bonus) foe.forEach((f) => { f.energy += L.bonus; });

    const P = { team: mine, active: 0, bag: [] }, C = { team: foe, active: 0, bag: [] };
    let over = false, turn = 0, quit = false;
    if (ON) { if (ADV) { P.bag = ON.bagP || []; C.bag = ON.bagC || []; } }
    else if (ADV) {
      // pioches : la tienne (ou une pioche de prêt) et celle de l'ordinateur
      P.bag = withDon((await Promise.all((opts.bag || []).map(async (it) => {
        try { const card = await adOf(it).getCard(it.id); const img = await App.col.displayImage(it, adOf(it), 'high'); return BC.bagCard(card, { img: img.src }); } catch (e) { return null; }
      }))).filter(Boolean), GAME);
      if (!P.bag.length) P.bag = await BC.loadBag(BC.loanBag(mine[0].type, GAME), GAME, { loan: true });
      C.bag = await BC.loadBag(BC.aiBag(L.n, foe[0].type, GAME), GAME);
    }
    // Pioche (mode Avancé) : chaque deck est mélangé, 3 cartes en main au départ, puis 1 de plus au début de chaque tour.
    // En ligne, le mélange vient de la graine du salon (le même sur les deux téléphones, dans le même ordre : d'abord celui qui commence).
    const hand = (side) => side.bag.map((c, i) => ({ c, i })).filter((x) => !x.c.used && x.c.inHand !== false);
    const pileTxt = (side) => (side.pile && side.pile.length ? `<br>pioche : ${side.pile.length}` : '');
    const drawCard = (side) => { if (!side.pile || !side.pile.length) return null; const c = side.bag[side.pile.shift()]; if (c) c.inHand = true; return c || null; };
    if (ADV) {
      const shuffle = (side, r) => {
        side.bag.forEach((c) => { c.inHand = false; });
        side.pile = side.bag.map((_, i) => i);
        for (let i = side.pile.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [side.pile[i], side.pile[j]] = [side.pile[j], side.pile[i]]; }
      };
      if (ON) {
        const first = ON.first === 'P' ? P : C;
        shuffle(first, App.duel.rng(((ON.seed | 0) ^ 0x2545f491) >>> 0));
        shuffle(first === P ? C : P, App.duel.rng(((ON.seed | 0) ^ 0x68e31da4) >>> 0));
      } else { shuffle(P, Math.random); shuffle(C, Math.random); }
      for (let k = 0; k < BC.HAND_START; k++) { drawCard(P); drawCard(C); }
    }
    // Reprise après un rafraîchissement : mes coups déjà joués (gardés sur ce téléphone) sont rejoués en accéléré,
    // ceux de l'ami arrivent du serveur ; même graine = mêmes pièces : on retombe exactement au même endroit.
    const rp = ON && Array.isArray(ON.replay) ? ON.replay.filter((mv) => mv && ['card', 'act', 'replace'].includes(mv.kind)) : [];
    let pendingTo = null;
    if (rp.length) { setFast(true); App.sfx.quiet(true); ov.classList.add('bt-replay'); }
    const caughtUp = () => {
      if (!isFast()) return;
      setFast(false); App.sfx.quiet(false); ov.classList.remove('bt-replay');
      if (!over) { drawAll(); drawFoeBag(); }
    };
    /** prochain de mes coups enregistrés, sous la forme d'un choix du joueur */
    const fromRp = () => {
      const mv = rp.shift();
      if (mv.kind === 'card') { pendingTo = Number.isInteger(mv.to) ? mv.to : null; return { type: 'card', i: mv.i }; }
      return { type: mv.type, i: mv.i, to: mv.to };
    };

    ov.innerHTML = `<div class="bt-bg" aria-hidden="true"></div>
      <div class="bt-top"><span class="bt-lic" title="${esc(LC.name)}">${App.icons.icon(LC.icon, 14)}</span><span class="bt-lvl" style="--lc:${L.color}">${ON ? `${App.icons.icon('users', 13)} Contre ${esc(L.name)}` : `Niveau ${L.n} · ${esc(L.name)}`}</span>${ON ? '<span class="bt-net small" hidden>Connexion…</span>' : ''}${teamName ? `<span class="bt-tname muted small">${esc(teamName)}</span>` : ''}<span class="spacer"></span>${ADV ? '<span class="bt-foebag small muted"></span>' : ''}<button class="btn sm ghost" data-quit>Abandonner</button></div>
      <div class="bt-arena">
        <div class="bt-side foe"><div class="bt-bench" data-side="C"></div><div class="bt-active" data-side="C"></div></div>
        <div class="bt-log" aria-live="polite"></div>
        <div class="bt-side me"><div class="bt-active" data-side="P"></div><div class="bt-bench" data-side="P"></div></div>
      </div>
      <div class="bt-actions"></div>
      <div class="bt-fx"></div>
      <div class="bt-banner"></div>`;
    const $ = (s) => ov.querySelector(s);
    const fx = $('.bt-fx'), arena = $('.bt-arena');
    ov.addEventListener('scroll', () => { if (ov.scrollTop || ov.scrollLeft) { ov.scrollTop = 0; ov.scrollLeft = 0; } });
    const log = (h) => { const l = $('.bt-log'); l.innerHTML = T(h); l.classList.remove('new'); void l.offsetWidth; l.classList.add('new'); };
    const keyOf = (side) => (side === P ? 'P' : 'C');
    const cardEl = (f) => ov.querySelector(`.bt-card[data-uid="${f.uid}"]`);
    const figEl = (f) => { const c = cardEl(f); return c && c.querySelector('.bt-fig'); };

    // ----- effets visuels -----
    const ctr = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
    const part = (cls, col, size) => { const d = document.createElement('div'); d.className = 'bt-p ' + cls; d.style.setProperty('--c', col); d.style.width = d.style.height = size + 'px'; fx.appendChild(d); return d; };
    const run = (el, kf, o) => { const a = el.animate(kf, { fill: 'forwards', ...o }); const rm = () => el.remove(); a.finished.then(rm, rm); return a; };
    const at = (x, y, extra = '') => `translate(${x}px, ${y}px) translate(-50%, -50%) ${extra}`;

    /** gerbe de particules autour d'un élément */
    function burst(el, type, { n = 14, spread = 1, col = null, up = 0, size = 1 } = {}) {
      if (!el || RM()) return;
      const c = ctr(el), color = col || typeColor(type);
      const fall = type === 'grass' || type === 'water' ? 40 : 0;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, dist = (35 + Math.random() * 90) * spread, s = (6 + Math.random() * 10) * size;
        const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist + fall - up;
        const p = part('t-' + type, color, s);
        run(p, [{ transform: at(c.x, c.y, 'scale(1)'), opacity: 1 }, { transform: at(c.x + dx, c.y + dy, `scale(.2) rotate(${Math.random() * 360}deg)`), opacity: 0 }],
          { duration: 500 + Math.random() * 450, easing: 'cubic-bezier(.15,.7,.3,1)' });
      }
    }
    /** particules qui convergent vers la carte (concentration) */
    function gather(el, col) {
      if (!el || RM()) return;
      const c = ctr(el);
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 70;
        const p = part('spark', col, 5 + Math.random() * 6);
        run(p, [{ transform: at(c.x + Math.cos(ang) * dist, c.y + Math.sin(ang) * dist), opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: at(c.x, c.y, 'scale(.3)'), opacity: 0 }],
          { duration: 520 + Math.random() * 250, delay: Math.random() * 150, easing: 'ease-in' });
      }
    }
    function ring(el, col, big = 1) {
      if (!el || RM()) return;
      const c = ctr(el), d = document.createElement('div');
      d.className = 'bt-ring'; d.style.setProperty('--c', col); fx.appendChild(d);
      const s = Math.max(c.w, c.h) * 0.9 * big;
      d.style.width = d.style.height = s + 'px';
      run(d, [{ transform: at(c.x, c.y, 'scale(.2)'), opacity: 1 }, { transform: at(c.x, c.y, 'scale(1.5)'), opacity: 0 }], { duration: 520, easing: 'ease-out' });
    }
    function flash(col, a = 0.45) {
      if (RM()) return;
      const d = document.createElement('div'); d.className = 'bt-flash'; d.style.background = col; fx.appendChild(d);
      run(d, [{ opacity: 0 }, { opacity: a, offset: 0.2 }, { opacity: 0 }], { duration: 320 });
    }
    function shake(power) {
      if (RM() || power <= 0) return;
      const p = Math.min(16, power), kf = [];
      for (let i = 0; i < 7; i++) { const k = p * (1 - i / 7); kf.push({ transform: `translate(${(Math.random() * 2 - 1) * k}px, ${(Math.random() * 2 - 1) * k}px)` }); }
      kf.push({ transform: 'none' });
      arena.animate(kf, { duration: 420, easing: 'linear' });
    }
    /** éclair en zigzag entre deux points */
    function bolt(a, b, col) {
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'bt-bolt'); svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
      const pts = [], n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n, j = i === 0 || i === n ? 0 : (Math.random() * 2 - 1) * 28;
        const nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
        pts.push(`${a.x + (b.x - a.x) * t + (nx / l) * j},${a.y + (b.y - a.y) * t + (ny / l) * j}`);
      }
      for (const [w, c] of [[10, col], [3, '#fff']]) {
        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('points', pts.join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', c);
        pl.setAttribute('stroke-width', w); pl.setAttribute('stroke-linejoin', 'round'); svg.appendChild(pl);
      }
      fx.appendChild(svg);
      run(svg, [{ opacity: 1 }, { opacity: 0.2, offset: 0.25 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 380 });
    }
    /** projectile de la couleur du type, de l'attaquant vers le défenseur */
    async function projectile(fromEl, toEl, type) {
      if (!fromEl || !toEl || RM()) return;
      const a = ctr(fromEl), b = ctr(toEl), col = typeColor(type);
      if (type === 'lightning') { bolt(a, b, col); flash('#ffe27a', 0.3); await sleep(160); return; }
      if (type === 'fighting' || type === 'colorless') return; // coup direct : la carte fonce
      const dur = 380, mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18, my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.08;
      const spin = type === 'metal' || type === 'grass' ? 540 : 0;
      for (let i = 0; i < 6; i++) {
        const s = Math.max(8, 38 - i * 6), p = part('orb t-' + type, col, s);
        run(p, [{ transform: at(a.x, a.y, 'scale(.4)'), opacity: i ? 0.7 - i * 0.1 : 1 },
          { transform: at(mx, my, `scale(1) rotate(${spin / 2}deg)`), offset: 0.5 },
          { transform: at(b.x, b.y, `scale(1.1) rotate(${spin}deg)`), opacity: i ? 0 : 1 }],
        { duration: dur, delay: i * 26, easing: 'cubic-bezier(.4,0,.8,.6)' });
      }
      await sleep(dur);
    }
    function lunge(f, target, far) {
      const fig = figEl(f), tg = cardEl(target);
      if (!fig || !tg) return;
      const a = ctr(fig), b = ctr(tg.querySelector('.bt-fig') || tg), k = far ? 0.55 : 0.28;
      const dx = (b.x - a.x) * k, dy = (b.y - a.y) * k, rot = dx > 0 ? 6 : -6;
      fig.animate([{ transform: 'none' }, { transform: `translate(${-dx * 0.12}px, ${-dy * 0.12}px) scale(.96)`, offset: 0.2 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.1) rotate(${rot}deg)`, offset: 0.5 }, { transform: 'none' }],
      { duration: RM() ? 1 : 560, easing: 'ease-out' });
    }
    function hitAnim(f, strong) {
      const fig = figEl(f); if (!fig || RM()) return;
      const k = strong ? 16 : 9;
      fig.animate([{ transform: 'none', filter: 'none' }, { transform: `translateX(${-k}px) rotate(-3deg)`, filter: 'brightness(2.6) saturate(0)', offset: 0.12 },
        { transform: `translateX(${k}px) rotate(2deg)`, filter: 'brightness(1.4)', offset: 0.32 }, { transform: `translateX(${-k / 2}px)`, offset: 0.55 },
        { transform: `translateX(${k / 3}px)`, offset: 0.75 }, { transform: 'none', filter: 'none' }], { duration: 520 });
    }
    function dodge(f) {
      const fig = figEl(f); if (!fig || RM()) return;
      fig.animate([{ transform: 'none' }, { transform: 'translateX(38px) rotate(8deg)', opacity: 0.6, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'ease-out' });
    }
    async function koAnim(f) {
      const fig = figEl(f); if (!fig) return;
      burst(fig, 'ko', { n: 18, col: '#9aa2bd', up: 40, size: 1.4 });
      if (RM()) return;
      await fig.animate([{ transform: 'none', filter: 'none' }, { transform: 'translateY(-10px) rotate(3deg)', filter: 'brightness(2.2)', offset: 0.2 },
        { transform: 'translateY(34px) rotate(-14deg) scale(.88)', filter: 'grayscale(1) brightness(.45)', opacity: 0.55 }],
      { duration: 900, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    }
    function enterAnim(f, side) {
      const fig = figEl(f); if (!fig || RM()) return;
      const dir = side === P ? -1 : 1;
      fig.animate([{ transform: `translateX(${dir * 160}px) scale(.5) rotate(${dir * 18}deg)`, opacity: 0, filter: 'brightness(3)' },
        { transform: 'translateX(0) scale(1.08)', opacity: 1, filter: 'brightness(1.6)', offset: 0.6 }, { transform: 'none', filter: 'none' }],
      { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1.15)' });
      setTimeout(() => { ring(fig, typeColor(f.type)); burst(fig, f.type, { n: 10, spread: 0.8 }); }, 300);
    }
    async function leaveAnim(f, side) {
      const fig = figEl(f); if (!fig || RM()) return;
      const dir = side === P ? -1 : 1;
      await fig.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${dir * 160}px) scale(.5) rotate(${dir * 14}deg)`, opacity: 0 }],
        { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    }
    function aura(f) {
      const c = cardEl(f); if (!c) return;
      c.classList.remove('aura'); void c.offsetWidth; c.classList.add('aura');
      clearTimeout(c._aura); c._aura = setTimeout(() => c.classList.remove('aura'), 900);
      gather(c.querySelector('.bt-fig'), typeColor(f.type));
    }
    function confetti() {
      if (RM()) return;
      const cols = ['#ffd23f', '#ff4fa3', '#7c5cff', '#34d5ff', '#3ddc97'];
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * innerWidth, p = part('confetti', cols[i % cols.length], 8 + Math.random() * 6);
        p.style.zIndex = 30;
        run(p, [{ transform: at(x, -20, 'rotate(0deg)'), opacity: 1 }, { transform: at(x + (Math.random() * 2 - 1) * 160, innerHeight + 40, `rotate(${Math.random() * 900}deg)`), opacity: 0.9 }],
          { duration: 1800 + Math.random() * 1600, delay: Math.random() * 700, easing: 'cubic-bezier(.3,.1,.6,1)' });
      }
    }

    // ----- dessin -----
    const shown = {}; // PV affichés (pour animer la barre)
    const lastUid = {};
    // Mode Avancé : les cartes de l'adversaire qui n'ont pas encore combattu restent face cachée sur son banc
    // (dans les deux sens en ligne : chaque téléphone cache le banc de l'autre). Elles se révèlent en entrant en jeu.
    const seen = new Set();
    const hidden = (side, f) => ADV && side === C && !seen.has(f.uid) && !f.ko && !over;
    const drawActive = (side, { noEnter = false } = {}) => {
      const f = B().active(side), key = keyOf(side);
      const reveal = ADV && side === C && !seen.has(f.uid) && lastUid.C !== undefined; // carte cachée qui se dévoile
      seen.add(f.uid);
      const prev = shown[f.uid] == null ? f.hp : shown[f.uid]; shown[f.uid] = f.hp;
      const r0 = Math.max(0, prev / f.maxHp), r = Math.max(0, f.hp / f.maxHp);
      const box = ov.querySelector(`.bt-active[data-side="${key}"]`);
      box.innerHTML = T(`<div class="bt-card ${f.ko ? 'ko' : ''}" data-uid="${f.uid}" style="--tc:${typeColor(f.type)}">
          <div class="bt-img"><div class="bt-plat"></div><div class="bt-fig"><img src="${esc(f.img)}" alt="${esc(f.name)}" data-alt="${esc(f.name)}"></div></div>
          <div class="bt-info"><div class="bt-name"><b>${esc(f.name)}</b>${typeChip(f.type, GAME)}${f.loan ? '<span class="bt-loan">prêt</span>' : ''}</div>
            <div class="bt-hp"><i style="width:${r0 * 100}%"></i><span style="width:${r0 * 100}%" class="${hpCls(r0)}"></span></div>
            <div class="bt-stats"><span><b class="bt-hpn">${Math.max(0, prev)}</b> / <span class="bt-hpmax">${f.maxHp}</span> PV</span>${pips(f.energy)}</div>${ADV ? `<div class="bt-tags">${tagsHtml(side)}</div>` : ''}</div></div>`);
      if (prev !== f.hp) {
        const span = box.querySelector('.bt-hp span'), ghost = box.querySelector('.bt-hp i'), num = box.querySelector('.bt-hpn');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          span.style.width = r * 100 + '%'; span.className = hpCls(r); ghost.style.width = r * 100 + '%';
          const t0 = performance.now(), from = Math.max(0, prev), to = Math.max(0, f.hp);
          const step = (t) => { const k = Math.min(1, (t - t0) / 650); num.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
        }));
      }
      const isNew = lastUid[key] !== f.uid; lastUid[key] = f.uid;
      if (isNew && !noEnter && !f.ko) enterAnim(f, side);
      if (reveal && !RM()) box.querySelector('.bt-img').animate([{ transform: 'perspective(600px) rotateY(90deg)' }, { transform: 'perspective(600px) rotateY(0)' }], { duration: 420, easing: 'ease-out' });
    };
    const drawBench = (side) => {
      const key = keyOf(side);
      ov.querySelector(`.bt-bench[data-side="${key}"]`).innerHTML = side.team.map((f, i) => hidden(side, f)
        ? `<button class="bt-mini hid" data-bench="${key}" data-i="${i}" title="Carte cachée : elle se dévoilera en entrant en jeu" tabindex="-1"><img src="${esc(LC.back)}" alt="Carte cachée"><b>?</b></button>`
        : `<button class="bt-mini ${i === side.active ? 'on' : ''} ${f.ko ? 'ko' : ''}" data-bench="${key}" data-i="${i}" title="${esc(f.name)} (${Math.max(0, f.hp)} PV)" ${key === 'C' ? 'tabindex="-1"' : ''}>
        <img src="${esc(f.img)}" alt="" data-alt="${esc(f.name)}"><span class="bt-mhp"><span style="width:${Math.max(0, (f.hp / f.maxHp) * 100)}%"></span></span></button>`).join('');
    };
    const drawAll = () => { drawActive(C); drawActive(P); drawBench(C); drawBench(P); };

    const banner = async (txt, cls = '') => { const b = $('.bt-banner'); b.className = 'bt-banner'; void b.offsetWidth; b.className = 'bt-banner show ' + cls; b.textContent = txt; await sleep(680); b.className = 'bt-banner'; };
    const floatTxt = (f, txt, cls) => { const c = cardEl(f); if (!c) return; const d = document.createElement('div'); d.className = 'bt-float ' + (cls || ''); d.textContent = txt; (c.querySelector('.bt-img') || c).appendChild(d); setTimeout(() => d.remove(), 1400); };

    /** Une attaque, avec son animation */
    async function doAttack(side, other, i) {
      const a = B().active(side), d = B().active(other), att = a.attacks[i];
      const r = B().damage(att, a, d, rnd);
      if (ADV && r.dmg > 0) {
        r.bonus = (side.power || 0) + (side.stadium && side.stadium.turns > 0 ? side.stadium.n : 0);
        r.shield = (d.shield || 0) + (d.armor || 0);
        r.dmg = Math.max(0, r.dmg + r.bonus - r.shield);
      }
      side.power = 0;
      a.energy = Math.max(0, a.energy - att.cost); // l'attaque utilise autant d'énergies que son coût
      log(`<b>${esc(a.name)}</b> utilise <b>${esc(att.name)}</b> !`);
      aura(a); App.sfx.charge();
      await sleep(RM() ? 100 : 380);
      const direct = a.type === 'fighting' || a.type === 'colorless';
      App.sfx.whoosh();
      lunge(a, d, direct);
      await sleep(RM() ? 50 : 230);
      await projectile(figEl(a), figEl(d), a.type);
      if (direct) await sleep(40);
      d.hp = Math.max(0, d.hp - r.dmg);
      const strong = r.dmg >= 80 || r.weak;
      if (r.dmg > 0) {
        App.sfx.hit(strong);
        const dfig = figEl(d);
        hitAnim(d, strong);
        burst(dfig, a.type, { n: strong ? 26 : 16, spread: strong ? 1.4 : 1 });
        ring(dfig, typeColor(a.type), strong ? 1.3 : 1);
        if (strong) flash(r.weak ? '#ffe27a' : '#fff', r.weak ? 0.4 : 0.3);
        shake(Math.round(r.dmg / 8) + (r.weak ? 6 : 0));
        if (r.weak) banner('Super efficace !', 'eff');
      } else dodge(d);
      floatTxt(d, r.dmg ? `−${r.dmg} PV` : r.shield ? 'Bloqué !' : 'Raté !', r.weak ? 'weak' : r.dmg ? (strong ? 'big' : '') : 'miss');
      const coinTxt = r.coins ? ` <span class="bt-coins">${r.coins.map((c) => (c ? '🟡 face' : '⚪ pile')).join(' · ')}</span>` : '';
      log(`<b>${esc(a.name)}</b> utilise <b>${esc(att.name)}</b> : ${r.dmg} dégâts${r.weak ? ' <span class="bt-eff">Super efficace !</span>' : ''}${r.resist ? ' <span class="muted">(résistance)</span>' : ''}${r.bonus ? ` <span class="bt-eff">(+${r.bonus} bonus)</span>` : ''}${r.shield ? ` <span class="muted">(−${r.shield} bouclier)</span>` : ''}${coinTxt}`);
      await sleep(260);
      // barre de PV : mise à jour sur place (animée)
      updateHp(other); drawBench(other);
      const ac2 = cardEl(a); if (ac2) ac2.querySelector('.bt-pips').outerHTML = T(pips(a.energy));
      await sleep(700);
      if (d.hp <= 0) {
        d.ko = true; App.sfx.ko();
        log(`<b>${esc(d.name)}</b> est K.O. !`);
        shake(10);
        await koAnim(d);
        drawActive(other, { noEnter: true }); drawBench(other);
        await sleep(350);
      }
    }
    /** met à jour la barre de PV sans redessiner la carte (sinon l'animation d'impact est coupée) */
    function updateHp(side) {
      const f = B().active(side), c = cardEl(f);
      if (!c) { drawActive(side); return; }
      const prev = shown[f.uid] == null ? f.hp : shown[f.uid]; shown[f.uid] = f.hp;
      const r = Math.max(0, f.hp / f.maxHp);
      const span = c.querySelector('.bt-hp span'), ghost = c.querySelector('.bt-hp i'), num = c.querySelector('.bt-hpn');
      span.style.width = r * 100 + '%'; span.className = hpCls(r); ghost.style.width = r * 100 + '%';
      const t0 = performance.now(), from = Math.max(0, prev), to = Math.max(0, f.hp);
      const step = (t) => { const k = Math.min(1, (t - t0) / 650); num.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }

    /** Mon sac (mode Avancé), visible dès le début et pendant le tour de l'adversaire : cartes en gris, les toucher montre leur effet */
    // ----- Sac (Pokémon) / Coffre (One Piece) : les cartes en main, toutes visibles d'un coup (v3.00) -----
    /** bouton du sac ; mode : 'play' (mon tour), 'used' (carte déjà jouée ce tour), 'idle' (tour de l'adversaire) */
    const bagBtn = (mode) => {
      if (!ADV) return '';
      const left = hand(P), n = left.length, pile = (P.pile || []).length;
      const okN = mode === 'play' ? left.filter(({ c }) => BC.playable(c, P, C)).length : 0;
      const sub = !n ? 'Vide pour l’instant' : mode === 'used' ? 'Carte jouée ✓' : mode === 'play' ? (okN ? `${okN} jouable${okN > 1 ? 's' : ''} · 1 par tour` : 'Rien d’utile maintenant') : 'Touche pour regarder';
      return T(`<button type="button" class="bt-bagbtn ${mode} ${okN ? 'has' : ''}" data-bagopen="${mode}" ${n ? '' : 'disabled'}>
        <span class="bt-bagic">${BAG_ICON[GAME] || BAG_ICON.pokemon}</span>
        <span class="bt-bagtx"><b>${esc(LC.bagName)}${n ? ` · ${n}` : ''}</b><small>${sub}${pile ? ` · pioche : ${pile}` : ''}</small></span>
        <span class="bt-bagfan">${left.slice(0, 4).map(({ c }) => `<img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}">`).join('')}</span></button>`);
    };
    const closeBag = () => { const s = ov.querySelector('.bt-sheet'); if (s) s.remove(); };
    function openBag(mode) {
      closeBag();
      const left = hand(P); if (!left.length) return;
      const d = document.createElement('div');
      d.className = 'bt-sheet';
      d.innerHTML = T(`<div class="bt-sheet-box" role="dialog" aria-label="${esc(LC.bagTitle)}">
        <div class="bt-sheet-h"><span class="bt-bagic">${BAG_ICON[GAME] || BAG_ICON.pokemon}</span><div><b>${esc(LC.bagTitle)}</b><small>${left.length} carte${left.length > 1 ? 's' : ''} en main${(P.pile || []).length ? ` · ${(P.pile || []).length} dans la pioche` : ''}</small></div>
          <button type="button" class="bt-sheet-x" data-bagclose aria-label="Fermer">×</button></div>
        <div class="bt-sheet-grid">${left.map(({ c, i }) => {
          const ok = mode === 'play' && BC.playable(c, P, C);
          return `<button type="button" class="bt-sc ${ok ? 'ok' : 'off'}" ${ok ? `data-card="${i}"` : `data-peek="${i}"`}><img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}"><b>${esc(c.name)}</b><em>${esc(c.fx.short)}</em><small>${esc(c.fx.desc)}</small></button>`;
        }).join('')}</div>
        <p class="bt-sheet-f">${mode === 'play' ? 'Touche une carte pour la jouer (une par tour, avant ton action). Les cartes grises ne servent à rien pour l’instant.' : mode === 'used' ? 'Tu as déjà joué une carte ce tour : les autres attendront.' : 'Ce n’est pas ton tour : tu peux seulement regarder.'}</p></div>`);
      ov.appendChild(d);
      if (!RM()) d.querySelector('.bt-sheet-box').animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
    const idleBag = () => bagBtn('idle');
    const showIdle = () => { if (!over) $('.bt-actions').innerHTML = idleBag(); };
    ov.addEventListener('click', (e) => {
      const bo = e.target.closest('[data-bagopen]'); if (bo && !bo.disabled) { App.sfx.click(); openBag(bo.dataset.bagopen); return; }
      if (e.target.closest('[data-bagclose]') || e.target.classList.contains('bt-sheet')) { closeBag(); return; }
      const p = e.target.closest('[data-peek]'); if (!p) return;
      const c = P.bag[+p.dataset.peek]; if (c) App.util.toast(T(`${c.name} : ${c.fx.desc}`), 3500);
    });

    /**
     * Dégâts réels d'une attaque contre le combattant d'en face (v3.00) : faiblesse, résistance,
     * et en Avancé bonus (PlusPower, Stade) et protections adverses — comme dans doAttack. lo / hi = pile ou face.
     */
    function realDmg(att, a, d, side) {
      const w = d.weak.find((x) => x.type === a.type), r = d.res.find((x) => x.type === a.type);
      const bonus = ADV ? (side.power || 0) + (side.stadium && side.stadium.turns > 0 ? side.stadium.n : 0) : 0;
      const guard = ADV ? (d.shield || 0) + (d.armor || 0) : 0;
      const one = (v) => {
        if (v <= 0) return 0;
        if (w) v = w.add ? v + w.add : v * w.mult;
        if (r) v = Math.max(0, v - r.sub);
        return v > 0 ? Math.max(0, v + bonus - guard) : 0;
      };
      const b = att.base, plus = 10 * Math.max(1, Math.round(b / 30));
      const [lo, hi] = att.mode === 'x' ? [one(0), one(b * 2)] : att.mode === '+' ? [one(b), one(b + plus)] : [one(b), one(b)];
      const tags = [w ? ['Faiblesse', 'up'] : null, r ? [`Résistance −${r.sub}`, 'down'] : null, bonus ? [`Bonus +${bonus}`, 'up'] : null, guard ? [`Protégé −${guard}`, 'down'] : null].filter(Boolean);
      const cls = tags.length ? (hi > (att.mode === 'x' ? b * 2 : att.mode === '+' ? b + plus : b) ? 'up' : 'down') : '';
      return { lo, hi, mod: tags.length > 0, tag: tags.map((t) => t[0]).join(' · '), cls };
    }

    /** Actions du joueur : on attend son choix */
    const playerChoice =(cardUsed = false) => new Promise((resolve) => {
      const a = B().active(P), foeA = B().active(C);
      const canSwitch = B().bench(P).length > 0;
      closeBag();
      const bagHtml = ADV ? bagBtn(cardUsed ? 'used' : 'play') : '';
      $('.bt-actions').innerHTML = T(bagHtml + `<div class="bt-atks">${a.attacks.map((x, i) => {
        const ok = x.cost <= a.energy, rd = realDmg(x, a, foeA, P);
        const raw = x.noDamage ? '10' : x.base + (x.mode === 'x' ? '×' : x.mode === '+' ? '+' : '');
        const val = !rd.mod ? raw : rd.lo === rd.hi ? `${rd.hi}` : `${rd.lo}–${rd.hi}`;
        return `<button class="bt-atk ${ok ? '' : 'off'}" data-atk="${i}" ${ok ? '' : 'disabled'} title="${esc(x.text)}" style="--tc:${typeColor(a.type)}">
          <span class="bt-cost">${costPips(x.cost)}</span><b>${esc(x.name)}${rd.tag ? `<small class="bt-dtag ${rd.cls}">${rd.tag}</small>` : ''}</b><span class="bt-dmg ${rd.cls}">${rd.mod ? `<s>${raw}</s> ` : ''}${val}</span></button>`;
      }).join('')}</div>
        <div class="bt-more"><button class="btn" data-charge>${App.icons.icon('bolt', 16)} +1 énergie</button>
          <button class="btn ghost" data-switch ${canSwitch ? '' : 'disabled'}>${App.icons.icon('swap', 16)} Changer</button></div>`);
      $('.bt-actions').classList.remove('in'); void $('.bt-actions').offsetWidth; $('.bt-actions').classList.add('in');
      const done = (v) => { ov.removeEventListener('click', h); closeBag(); $('.bt-actions').innerHTML = idleBag(); ov.classList.remove('pick-bench'); resolve(v); };
      const h = (e) => {
        if (over) return;
        const at2 = e.target.closest('[data-atk]'); if (at2 && !at2.disabled) { done({ type: 'attack', i: +at2.dataset.atk }); return; }
        const cd = e.target.closest('[data-card]'); if (cd && !cd.disabled) { done({ type: 'card', i: +cd.dataset.card }); return; }
        if (e.target.closest('[data-charge]')) { done({ type: 'charge' }); return; }
        if (e.target.closest('[data-switch]') && canSwitch) { log('Choisis le Pokémon à envoyer (touche-le sur ton banc).'); ov.classList.add('pick-bench'); return; }
        const bb = e.target.closest('[data-bench="P"]');
        if (bb && ov.classList.contains('pick-bench')) {
          const i = +bb.dataset.i; if (i === P.active || P.team[i].ko) return;
          done({ type: 'switch', to: i });
        }
      };
      ov.addEventListener('click', h);
    });
    /** Remplaçant après un K.O. (le joueur choisit) */
    const playerReplace = (msg, notActive) => {
      if (pendingTo != null) { const t = pendingTo; pendingTo = null; return Promise.resolve(t); } // reprise : cible déjà choisie
      if (rp.length && rp[0].kind === 'replace') return Promise.resolve(rp.shift().to);
      caughtUp();
      return playerReplaceUI(msg, notActive);
    };
    const playerReplaceUI = (msg = 'Ton Pokémon est K.O. : touche le suivant sur ton banc.', notActive = false) => new Promise((resolve) => {
      log(msg);
      ov.classList.add('pick-bench');
      const h = (e) => {
        const bb = e.target.closest('[data-bench="P"]'); if (!bb) return;
        const i = +bb.dataset.i; if (P.team[i].ko || (notActive && i === P.active)) return;
        ov.removeEventListener('click', h); ov.classList.remove('pick-bench'); resolve(i);
      };
      ov.addEventListener('click', h);
    });

    const gain = (side) => {
      const f = B().active(side); f.energy += 1; App.sfx.energy();
      const c = cardEl(f);
      if (c) { c.querySelector('.bt-pips').outerHTML = T(pips(f.energy)); const p = c.querySelector('.bt-pips i:last-child'); if (p) { p.classList.add('new'); burst(p, 'spark', { n: 6, spread: 0.35, col: '#ffc83d', size: 0.6 }); } }
      else drawActive(side);
    };
    const switchTo = async (side, i) => {
      App.sfx.swap();
      await leaveAnim(B().active(side), side);
      side.active = i; drawAll();
    };

    // ---------- cartes du sac (combat avec Dresseurs & Énergies) ----------
    function tagsHtml(side) {
      const f = B().active(side), t = [];
      if (f.shield) t.push(`<span class="bt-tag sh" title="Subit ${f.shield} dégâts de moins jusqu’au prochain tour">🛡 −${f.shield}</span>`);
      if (side.power) t.push(`<span class="bt-tag pw" title="Prochaine attaque">⚔ +${side.power}</span>`);
      if (side.stadium && side.stadium.turns > 0) t.push(`<span class="bt-tag st" title="${esc(side.stadium.name)}">🏟 +${side.stadium.n} · ${side.stadium.turns} t.</span>`);
      if (f.tool) t.push(`<span class="bt-tag tl" title="Outil attaché">🔧 ${esc(f.tool)}</span>`);
      return t.join('');
    }
    const refreshTags = (side) => { if (!ADV) return; const c = cardEl(B().active(side)); const el = c && c.querySelector('.bt-tags'); if (el) el.innerHTML = tagsHtml(side); };
    const refreshPips = (f) => { const c = cardEl(f); if (c) c.querySelector('.bt-pips').outerHTML = T(pips(f.energy)); };
    const drawFoeBag = () => { const el = $('.bt-foebag'); if (el) { const n = hand(C).length, p = (C.pile || []).length; el.textContent = n || p ? `Main adverse : ${n} · pioche : ${p}` : ''; } };
    function heal(side, f, n) {
      const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + n);
      const got = f.hp - before;
      if (f === B().active(side)) { updateHp(side); if (got) { floatTxt(f, `+${got}`, 'heal'); burst(figEl(f), 'grass', { n: 12, col: '#3ddc97', up: 70, spread: 0.7 }); } }
      return got;
    }
    /** grande carte qui apparaît au milieu de l'écran */
    async function showPlayed(c, isP) {
      const d = document.createElement('div');
      d.className = 'bt-played';
      d.innerHTML = `<img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}"><div><b>${esc(c.name)}</b><small>${esc(T(c.fx.desc))}</small></div>`;
      ov.appendChild(d);
      App.sfx.whoosh();
      if (RM()) { await sleep(900); d.remove(); return; }
      const y = isP ? '45vh' : '-45vh';
      await d.animate([{ transform: `translate(-50%, -50%) translateY(${y}) scale(.4) rotate(${isP ? -8 : 8}deg)`, opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.06)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -50%) scale(.85)', opacity: 0 }], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
      d.remove();
    }
    /** joue la carte i du sac ; renvoie le Pokémon choisi pour « Échange » (pour l'envoyer à l'ami) */
    async function playCard(side, other, i, remoteTo) {
      const c = side.bag[i]; if (!c || c.used) return null;
      c.used = true; drawFoeBag();
      const isP = side === P, me = B().active(side), him = B().active(other), fx2 = c.fx;
      let chosen = null;
      log(`${isP ? 'Tu joues' : `${esc(foeWho)} joue`} <b>${esc(c.name)}</b>…`);
      await showPlayed(c, isP);
      let msg = '';
      switch (fx2.key) {
        case 'energy': case 'charge': {
          const n = fx2.key === 'charge' ? 1 : fx2.n + (fx2.eType && fx2.eType === me.type ? 1 : 0);
          me.energy += n; refreshPips(me); App.sfx.energy(); gather(figEl(me), '#ffc83d');
          msg = `+${n} énergie${n > 1 ? 's' : ''} pour ${esc(me.name)}`; break;
        }
        case 'heal': { const g = heal(side, me, fx2.n); App.sfx.energy(); msg = `${esc(me.name)} récupère ${g} PV`; break; }
        case 'fullHeal': { const g = heal(side, me, me.maxHp); me.energy = 0; refreshPips(me); msg = `${esc(me.name)} récupère ${g} PV mais perd ses énergies`; break; }
        case 'healAll': { let g = 0; side.team.forEach((f) => { if (!f.ko) g += heal(side, f, fx2.n); }); drawBench(side); msg = `ton équipe récupère ${g} PV`; if (!isP) msg = `son équipe récupère ${g} PV`; break; }
        case 'power': side.power = fx2.n; aura(me); msg = `la prochaine attaque de ${esc(me.name)} fait +${fx2.n} dégâts`; break;
        case 'shield': me.shield = fx2.n; ring(figEl(me), '#5fb4ff', 1.1); msg = `${esc(me.name)} subira ${fx2.n} dégâts de moins`; break;
        case 'switch': {
          const to = isP ? await playerReplace('Choisis le Pokémon à envoyer (touche-le sur ton banc).', true)
            : ON ? (B().bench(side).some((x) => x.i === remoteTo) ? remoteTo : null) : B().aiReplace(side, other, L.n);
          chosen = to;
          if (to != null && to !== side.active) { await switchTo(side, to); msg = `${esc(B().active(side).name)} entre en jeu`; }
          break;
        }
        case 'gust': {
          const w = B().bench(other).sort((a, b) => a.f.hp - b.f.hp)[0];
          if (w) { await switchTo(other, w.i); msg = `${esc(B().active(other).name)} est forcé de combattre`; }
          break;
        }
        case 'strip': {
          const n = Math.min(fx2.n, him.energy); him.energy -= n; refreshPips(him);
          burst(figEl(him), 'ko', { n: 10, col: '#ffc83d', spread: 0.7 }); App.sfx.hit(false);
          msg = `${esc(him.name)} perd ${n} énergie${n > 1 ? 's' : ''}`; break;
        }
        case 'revive': {
          const k = side.team.find((f) => f.ko);
          if (k) { k.ko = false; k.hp = Math.max(10, Math.ceil(k.maxHp / 20) * 10); k.energy = 0; shown[k.uid] = k.hp; drawBench(side); msg = `${esc(k.name)} revient sur le banc avec ${k.hp} PV`; }
          break;
        }
        case 'toolHp': me.tool = c.name; me.maxHp += fx2.n; me.hp += fx2.n; shown[me.uid] = me.hp; drawActive(side, { noEnter: true }); msg = `${esc(me.name)} gagne ${fx2.n} PV`; break;
        case 'noWeak': me.tool = c.name; me.weak = []; msg = `${esc(me.name)} n’a plus de faiblesse`; break;
        case 'armor': me.tool = c.name; me.armor = fx2.n; ring(figEl(me), '#5fb4ff', 1.1); msg = `${esc(me.name)} subira ${fx2.n} dégâts de moins pendant tout le combat`; break;
        case 'regen': me.tool = c.name; me.regen = fx2.n; msg = `${esc(me.name)} se soignera de ${fx2.n} PV à chaque tour`; break;
        case 'stadium': side.stadium = { n: fx2.n, turns: 3, name: c.name }; flash(typeColor(me.type), 0.2); msg = `+${fx2.n} dégâts pendant 3 tours`; break;
        default: break;
      }
      refreshTags(side); refreshTags(other); drawBench(side);
      log(`${isP ? 'Tu joues' : `${esc(foeWho)} joue`} <b>${esc(c.name)}</b> : ${msg || 'sans effet'}.`);
      await sleep(650);
      return chosen;
    }
    function startTurn(side) {
      if (!ADV) return;
      side.team.forEach((f) => { f.shield = 0; });
      refreshTags(side);
      // pioche (v3.00, plus lente) : 1 carte tous les 2 tours (2e, 4e, 6e…), main de 4 cartes au plus
      side.turns = (side.turns || 0) + 1;
      const c = side.turns % BC.DRAW_EVERY === 0 && hand(side).length < BC.HAND_MAX ? drawCard(side) : null;
      if (side === C) drawFoeBag();
      else if (c) { App.sfx.swap(); log(`Tu pioches <b>${esc(c.name)}</b> (${esc(c.fx.short)}).`); }
    }
    async function endTurn(side) {
      if (!ADV) return;
      side.power = 0;
      if (side.stadium && side.stadium.turns > 0) side.stadium.turns--;
      const f = B().active(side);
      if (f && !f.ko && f.regen && f.hp < f.maxHp) { heal(side, f, f.regen); await sleep(450); }
      refreshTags(side);
    }

    let resolveEnd;
    const ended = new Promise((r) => { resolveEnd = r; });
    function finish(win, why = '') {
      if (over) return;
      over = true; setFast(false); App.sfx.quiet(false); ov.classList.remove('bt-replay');
      drawBench(C); // fin du combat : les cartes cachées se dévoilent
      $('.bt-actions').innerHTML = '';
      if (ON) { ON.link.send({ kind: quit ? 'quit' : 'over', win: !!win }); ON.link.flush(); }
      const b = document.createElement('div');
      b.className = 'bt-end ' + (win ? 'win' : 'lose');
      const txt = ON
        ? (win ? (why === 'quit' ? `${esc(L.name)} a abandonné : victoire !` : `Tu as battu ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''} !`)
          : quit ? 'Tu as abandonné.' : `${esc(L.name)} a gagné cette fois. Demande-lui une revanche !`)
        : (win ? `Tu as battu le niveau ${L.n} · ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''}.${L.n < LVS.length ? ' Le niveau suivant est débloqué !' : ' ' + LC.champion}` : quit ? 'Tu as abandonné. Retente ta chance !' : 'L’ordinateur a gagné cette fois. Change d’équipe ou charge tes attaques plus tôt !');
      // un geste pour rejouer : « Revanche » (même niveau, ou nouveau salon avec le même ami), « Niveau suivant » après une victoire
      const next = !ON && win && L.n < LVS.length;
      b.innerHTML = `<div class="bt-end-box"><div class="bt-end-t">${win ? 'Victoire !' : 'Défaite…'}</div>
        <p>${txt}</p>
        ${ON ? '<p class="bt-rematch-msg small" aria-live="polite"></p>' : ''}
        <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap">${next ? '<button class="btn primary" data-next>Niveau suivant</button>' : ''}<button class="btn ${next ? '' : 'primary'}" data-again>${App.icons.icon('swap', 15)} Revanche</button><button class="btn ghost" data-back>Retour</button></div></div>`;
      ov.appendChild(b);
      if (win) { App.sfx.open(L.n >= 3 || ON ? 5 : 3); confetti(); } else App.sfx.lose();
      // en ligne : on regarde si l'ami propose une revanche (salon créé par lui)
      let watching = !!(ON && ON.code), asked = false, foeAsked = null;
      const rmMsg = b.querySelector('.bt-rematch-msg'), rmBtn = b.querySelector('[data-again]');
      if (watching) (async () => {
        while (watching) {
          await new Promise((r) => setTimeout(r, document.visibilityState === 'visible' ? 1500 : 4000));
          if (!watching) return;
          const s = await App.duel.state(ON.code, 1e6).catch(() => null);
          if (!watching || !s) continue;
          if (s.rematch && s.rematchBy === 'foe' && !foeAsked) {
            foeAsked = s.rematch; App.sfx.click();
            rmMsg.innerHTML = `<b style="color:var(--ok, #3ddc97)">${esc(L.name)} propose une revanche !</b>`;
            rmBtn.innerHTML = `${App.icons.icon('check', 15)} Accepter la revanche`; rmBtn.classList.add('primary');
          }
        }
      })();
      const leave = (v) => { watching = false; close(); resolveEnd({ ...v, game: GAME }); };
      b.addEventListener('click', async (e) => {
        if (e.target.closest('[data-next]')) { leave({ win, again: 'next' }); return; }
        if (e.target.closest('[data-back]')) { if (foeAsked) App.duel.cancel(foeAsked); leave({ win, again: false }); return; } // revanche refusée : son salon est fermé
        if (!e.target.closest('[data-again]')) return;
        if (!ON) { leave({ win, again: true }); return; }
        if (asked) return;
        asked = true; rmBtn.disabled = true; rmMsg.textContent = 'Préparation de la revanche…';
        try { const code = await App.duel.rematch(ON.code); leave({ win, again: false, rematch: code, mode: ADV ? 'adv' : 'classic', foeName: L.name }); }
        catch (err) { asked = false; rmBtn.disabled = false; rmMsg.innerHTML = `<span style="color:#ff8a8a">${esc(err.message)}</span>`; }
      });
    }
    ov.querySelector('[data-quit]').addEventListener('click', async () => {
      if (over) return;
      if (await App.util.ask({ icon: 'flame', danger: true, title: 'Abandonner le combat ?', text: ON ? `Ça compte comme une défaite, et ${L.name} gagne.` : 'Ça compte comme une défaite.', ok: 'Abandonner', cancel: 'Continuer' }) && !over) { quit = true; finish(false); }
    });

    // ---------- contre un ami : attendre son coup ----------
    let stopWait = null;
    if (ON) {
      ON.link.onQuit = () => { if (!over) finish(true, 'quit'); };
      const net = $('.bt-net');
      ON.link.onStatus = (s) => { if (net) net.hidden = s !== 'net'; };
    }
    /** prochain coup de l'ami, avec « En attente de … » à l'écran (et, après 2 min, de quoi arrêter) */
    async function remote() {
      const box = $('.bt-actions');
      box.innerHTML = idleBag() + `<div class="bt-wait"><span class="bt-wait-dots"><i></i><i></i><i></i></span> ${esc(L.name)} réfléchit…</div>`;
      const t = setInterval(() => {
        if (over || !ON.link.waiting || ON.link.idle < 120000 || box.querySelector('[data-stop]')) return;
        box.insertAdjacentHTML('beforeend', `<div class="bt-wait-late small muted">${esc(L.name)} ne répond plus ? <button class="btn sm ghost" data-stop>Arrêter le combat</button> <span>(ni victoire ni défaite)</span></div>`);
        box.querySelector('[data-stop]').addEventListener('click', () => { over = true; close(); resolveEnd({ win: null, again: false }); });
      }, 5000);
      stopWait = () => clearInterval(t);
      // reprise : plus rien à rejouer (mes coups faits, ceux de l'ami déjà reçus) → on repasse en vitesse normale
      const cu = isFast() ? setInterval(() => { if (!rp.length && ON.link.ready && !ON.link.queued) caughtUp(); }, 150) : null;
      const mv = await ON.link.next();
      clearInterval(t); if (cu) clearInterval(cu);
      if (!over) box.innerHTML = idleBag();
      return mv && typeof mv === 'object' ? mv : {};
    }
    const send = (mv) => { if (ON && !over) ON.link.send(mv); };
    const validIdx = (n, ok) => (Number.isInteger(n) && ok(n) ? n : null);

    /** Pile ou face au début d'un combat en ligne : la pièce tourne puis montre qui commence (même tirage chez les deux joueurs) */
    async function coinToss(meFirst) {
      const w = document.createElement('div');
      w.className = 'bt-toss';
      const ini = esc((L.name || '?').trim().charAt(0).toUpperCase() || '?');
      w.innerHTML = `<div class="bt-toss-box"><div class="bt-toss-t">Pile ou face : qui commence ?</div>
        <div class="bt-coin3d"><div class="bt-coin ${RM() ? 'still ' + (meFirst ? 'me' : 'foe') : ''}" style="--end:${meFirst ? 1800 : 1980}deg">
          <div class="bt-coin-f me"><b>${App.icons.icon('user', 30)}</b><span>Toi</span></div>
          <div class="bt-coin-f foe"><b>${ini}</b><span>${esc(String(L.name).slice(0, 12))}</span></div></div></div>
        <div class="bt-toss-r"></div></div>`;
      ov.appendChild(w);
      App.sfx.whoosh();
      log('Pile ou face pour savoir qui commence…');
      await sleep(RM() ? 300 : 1900); // la pièce tourne (animation CSS de 1,8 s)
      App.sfx.click();
      const r = w.querySelector('.bt-toss-r');
      r.innerHTML = meFirst ? '<b>Tu commences !</b>' : `<b>${esc(L.name)} commence</b>`;
      r.classList.add('on');
      log(meFirst ? 'Pile ou face : <b>tu commences</b> !' : `Pile ou face : <b>${esc(L.name)}</b> commence.`);
      await sleep(1500);
      w.remove();
    }

    drawAll(); drawFoeBag(); showIdle();
    log(`Le combat commence ! <b>${esc(B().active(P).name)}</b> contre <b>${esc(B().active(C).name)}</b>.`);
    App.sfx.unlock();
    await sleep(900);
    if (ON) await coinToss(ON.first === 'P');


    // ---------- les tours ----------
    /** mon tour ; renvoie faux si le combat est fini */
    async function turnP() {
      turn++;
      await banner(LC.myTurn, 'me');
      if (over) return false;
      startTurn(P);
      gain(P);
      let act, used = false;
      for (;;) {
        if (rp.length && rp[0].kind === 'replace') rp.length = 0; // ne devrait pas arriver : on arrête de rejouer
        act = rp.length ? fromRp() : (caughtUp(), await playerChoice(used));
        if (over || act.type !== 'card') break;
        const c = P.bag[act.i], i = act.i;
        if (c && c.fx.key !== 'switch') send({ kind: 'card', i });
        const to = await playCard(P, C, i); used = true;
        if (c && c.fx.key === 'switch') send({ kind: 'card', i, to });
        if (over) return false;
      }
      if (over) return false;
      send({ kind: 'act', type: act.type, i: act.i, to: act.to });
      if (act.type === 'attack') await doAttack(P, C, act.i);
      else if (act.type === 'charge') { gain(P); aura(B().active(P)); App.sfx.charge(); log(`<b>${esc(B().active(P).name)}</b> se concentre : +1 énergie.`); await sleep(750); }
      else { await switchTo(P, act.to); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(750); }
      if (over) return false;
      await endTurn(P);
      if (B().active(C).ko) {
        if (!B().alive(C).length) { await sleep(300); finish(true); return false; }
        if (ON) {
          const mv = await remote(); if (over) return false;
          C.active = validIdx(mv.to, (n) => C.team[n] && !C.team[n].ko) ?? B().bench(C)[0].i;
        } else C.active = B().aiReplace(C, P, L.n);
        drawAll(); log(`${esc(foeWho)} envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(950);
      }
      return !over;
    }
    /** tour de l'adversaire (ordinateur ou ami) */
    async function turnC() {
      showIdle();
      await banner(ON ? `Tour de ${L.name}` : 'Tour de l’ordinateur', 'foe');
      if (over) return false;
      startTurn(C);
      gain(C);
      await sleep(450);
      let mv;
      if (ON) {
        // l'ami peut d'abord jouer une carte de son sac, puis son action
        mv = await remote();
        if (over) return false;
        if (mv.kind === 'card') {
          const i = validIdx(mv.i, (n) => C.bag[n] && BC.playable(C.bag[n], C, P));
          if (ADV && i != null) { await playCard(C, P, i, mv.to); await sleep(250); }
          if (over) return false;
          mv = await remote();
          if (over) return false;
        }
        const a = B().active(C);
        if (mv.type === 'attack' && validIdx(mv.i, (n) => a.attacks[n] && a.attacks[n].cost <= a.energy) != null) mv = { type: 'attack', i: mv.i };
        else if (mv.type === 'switch' && validIdx(mv.to, (n) => B().bench(C).some((x) => x.i === n)) != null) mv = { type: 'switch', to: mv.to };
        else mv = { type: 'charge' };
      } else {
        if (ADV) { const ci = BC.aiCard(C, P, L.n); if (ci >= 0) { await playCard(C, P, ci); await sleep(250); } }
        if (over) return false;
        mv = B().aiMove(C, P, L.n);
      }
      if (over) return false;
      if (mv.type === 'attack') await doAttack(C, P, mv.i);
      else if (mv.type === 'charge') { gain(C); aura(B().active(C)); App.sfx.charge(); log(`<b>${esc(B().active(C).name)}</b> se concentre : +1 énergie.`); await sleep(800); }
      else { await switchTo(C, mv.to); log(`${esc(foeWho)} rappelle son Pokémon et envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(950); }
      if (over) return false;
      await endTurn(C);
      if (B().active(P).ko) {
        if (!B().alive(P).length) { await sleep(300); finish(false); return false; }
        drawAll();
        const i = await playerReplace(); if (over) return false;
        send({ kind: 'replace', to: i });
        P.active = i; drawAll(); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(700);
      }
      return !over;
    }
    (async () => {
      const foeFirst = ON && ON.first === 'C';
      while (!over) {
        if (foeFirst) { if (!await turnC() || !await turnP()) break; }
        else if (!await turnP() || !await turnC()) break;
      }
      if (stopWait) stopWait();
    })().catch((e) => { console.error(e); if (!over) { App.util.toast('Erreur pendant le combat : ' + e.message, 4000); } });

    return ended;
  }

  Object.assign(App.matchParts, { battle });
})();
