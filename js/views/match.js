/* Page « Match » : combats simplifiés avec tes cartes, contre l'ordinateur (5 niveaux), 3 équipes */
(() => {
  const { esc } = App.util;
  const B = () => App.battle;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ad = () => App.games.get('pokemon');
  const TEAMS = 3;
  const RM = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Données ----------
  /** profile.match = { teams:[{name, keys:[3 clés]}×3], teamIdx, team (= équipe choisie, pour les anciennes versions), beaten, wins, losses } */
  function normMatch(m) {
    m = Object.assign({ team: [], beaten: {}, wins: 0, losses: 0 }, m || {});
    let teams = Array.isArray(m.teams) ? m.teams : [];
    if (!teams.length && m.team && m.team.length) teams = [{ name: 'Équipe 1', keys: [...m.team] }];
    while (teams.length < TEAMS) teams.push({ name: `Équipe ${teams.length + 1}`, keys: [] });
    m.teams = teams.slice(0, TEAMS).map((t, i) => ({ name: String((t && t.name) || `Équipe ${i + 1}`).slice(0, 24), keys: ((t && t.keys) || []).slice(0, 3) }));
    m.teamIdx = Math.min(TEAMS - 1, Math.max(0, m.teamIdx | 0));
    return m;
  }
  async function getMatch() { const p = await App.col.getProfile(); return normMatch(p.match); }
  async function saveMatch(m) { m.team = [...m.teams[m.teamIdx].keys]; const p = await App.col.getProfile(); p.match = m; await App.col.saveProfile(p); }
  const teamItems = (keys) => keys.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);

  /** Tes cartes Pokémon (d'après les listes des séries, gardées en cache) */
  async function myPokemon() {
    const items = App.col.all().filter((i) => i.qty > 0 && i.game === 'pokemon');
    const bySet = {};
    for (const it of items) (bySet[it.setId] = bySet[it.setId] || []).push(it);
    const out = [];
    await App.util.pool(Object.keys(bySet), 4, async (sid) => {
      const set = await ad().getSet(sid).catch(() => null);
      const cat = new Map((set ? set.cards : []).map((c) => [c.id, c]));
      for (const it of bySet[sid]) {
        const c = cat.get(it.id);
        if (c && c.category && !/pok/i.test(c.category)) continue; // catégorie inconnue : on tente
        out.push(Object.assign(Object.create(it), { _hp: c && c.hp ? +c.hp : null, _type: c && c.types && c.types[0] ? B().typeKey(c.types[0]) : null }));
      }
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
  const typeColor = (t) => (B().TYPE_INFO[t] || ['?', '#dfe4ee'])[1];
  const typeChip = (t) => { const [n, c] = B().TYPE_INFO[t] || ['?', '#999']; return `<span class="bt-type" style="--tc:${c}">${esc(n)}</span>`; };
  const pips = (n) => `<span class="bt-pips" title="${n} énergie${n > 1 ? 's' : ''}">${Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('')}${n > 8 ? `<b>+${n - 8}</b>` : ''}</span>`;
  const costPips = (n) => (n ? Array.from({ length: n }, () => '<i></i>').join('') : '<small>0</small>');
  const hpCls = (r) => (r < 0.3 ? 'low' : r < 0.6 ? 'mid' : '');

  // ---------- Écran de combat ----------
  async function battle(level, teamItemsList, teamName) {
    const ov = document.createElement('div');
    ov.className = 'bt-ov';
    ov.innerHTML = `<div class="bt-load">${App.ui.loading('Préparation du combat…')}</div>`;
    document.body.appendChild(ov); document.body.classList.add('cap-lock');
    const close = () => { ov.remove(); document.body.classList.remove('cap-lock'); };
    const L = B().LEVELS[level - 1];

    // équipes
    let mine = [], foe = [];
    try {
      mine = (await Promise.all(teamItemsList.map((it) => fromItem(it).catch(() => null)))).filter(Boolean);
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
      <div class="bt-top"><span class="bt-lvl" style="--lc:${L.color}">Niveau ${L.n} · ${esc(L.name)}</span>${teamName ? `<span class="bt-tname muted small">${esc(teamName)}</span>` : ''}<span class="spacer"></span><button class="btn sm ghost" data-quit>Abandonner</button></div>
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
    const log = (h) => { const l = $('.bt-log'); l.innerHTML = h; l.classList.remove('new'); void l.offsetWidth; l.classList.add('new'); };
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
    const drawActive = (side, { noEnter = false } = {}) => {
      const f = B().active(side), key = keyOf(side);
      const prev = shown[f.uid] == null ? f.hp : shown[f.uid]; shown[f.uid] = f.hp;
      const r0 = Math.max(0, prev / f.maxHp), r = Math.max(0, f.hp / f.maxHp);
      const box = ov.querySelector(`.bt-active[data-side="${key}"]`);
      box.innerHTML = `<div class="bt-card ${f.ko ? 'ko' : ''}" data-uid="${f.uid}" style="--tc:${typeColor(f.type)}">
          <div class="bt-img"><div class="bt-plat"></div><div class="bt-fig"><img src="${esc(f.img)}" alt="${esc(f.name)}" data-alt="${esc(f.name)}"></div></div>
          <div class="bt-info"><div class="bt-name"><b>${esc(f.name)}</b>${typeChip(f.type)}${f.loan ? '<span class="bt-loan">prêt</span>' : ''}</div>
            <div class="bt-hp"><i style="width:${r0 * 100}%"></i><span style="width:${r0 * 100}%" class="${hpCls(r0)}"></span></div>
            <div class="bt-stats"><span><b class="bt-hpn">${Math.max(0, prev)}</b> / ${f.maxHp} PV</span>${pips(f.energy)}</div></div></div>`;
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
    };
    const drawBench = (side) => {
      const key = keyOf(side);
      ov.querySelector(`.bt-bench[data-side="${key}"]`).innerHTML = side.team.map((f, i) => `<button class="bt-mini ${i === side.active ? 'on' : ''} ${f.ko ? 'ko' : ''}" data-bench="${key}" data-i="${i}" title="${esc(f.name)} (${Math.max(0, f.hp)} PV)" ${key === 'C' ? 'tabindex="-1"' : ''}>
        <img src="${esc(f.img)}" alt="" data-alt="${esc(f.name)}"><span class="bt-mhp"><span style="width:${Math.max(0, (f.hp / f.maxHp) * 100)}%"></span></span></button>`).join('');
    };
    const drawAll = () => { drawActive(C); drawActive(P); drawBench(C); drawBench(P); };

    const banner = async (txt, cls = '') => { const b = $('.bt-banner'); b.className = 'bt-banner'; void b.offsetWidth; b.className = 'bt-banner show ' + cls; b.textContent = txt; await sleep(680); b.className = 'bt-banner'; };
    const floatTxt = (f, txt, cls) => { const c = cardEl(f); if (!c) return; const d = document.createElement('div'); d.className = 'bt-float ' + (cls || ''); d.textContent = txt; (c.querySelector('.bt-img') || c).appendChild(d); setTimeout(() => d.remove(), 1400); };

    /** Une attaque, avec son animation */
    async function doAttack(side, other, i) {
      const a = B().active(side), d = B().active(other), att = a.attacks[i];
      const r = B().damage(att, a, d);
      a.energy = 0; // l'attaque utilise toutes les énergies (règle simplifiée)
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
      floatTxt(d, r.dmg ? `−${r.dmg}` : 'Raté !', r.weak ? 'weak' : r.dmg ? (strong ? 'big' : '') : 'miss');
      const coinTxt = r.coins ? ` <span class="bt-coins">${r.coins.map((c) => (c ? '🟡 face' : '⚪ pile')).join(' · ')}</span>` : '';
      log(`<b>${esc(a.name)}</b> utilise <b>${esc(att.name)}</b> : ${r.dmg} dégâts${r.weak ? ' <span class="bt-eff">Super efficace !</span>' : ''}${r.resist ? ' <span class="muted">(résistance)</span>' : ''}${coinTxt}`);
      await sleep(260);
      // barre de PV : mise à jour sur place (animée)
      updateHp(other); drawBench(other);
      const ac2 = cardEl(a); if (ac2) ac2.querySelector('.bt-pips').outerHTML = pips(0);
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

    /** Actions du joueur : on attend son choix */
    const playerChoice = () => new Promise((resolve) => {
      const a = B().active(P), foeA = B().active(C);
      const canSwitch = B().bench(P).length > 0;
      $('.bt-actions').innerHTML = `<div class="bt-atks">${a.attacks.map((x, i) => {
        const ok = x.cost <= a.energy, exp = Math.round(B().expected(x, a, foeA));
        return `<button class="bt-atk ${ok ? '' : 'off'}" data-atk="${i}" ${ok ? '' : 'disabled'} title="${esc(x.text)}" style="--tc:${typeColor(a.type)}">
          <span class="bt-cost">${costPips(x.cost)}</span><b>${esc(x.name)}</b><span class="bt-dmg">${x.noDamage ? '10' : x.base + (x.mode === 'x' ? '×' : x.mode === '+' ? '+' : '')}${exp > x.base * 1.4 ? ' <em>×2</em>' : ''}</span></button>`;
      }).join('')}</div>
        <div class="bt-more"><button class="btn" data-charge>${App.icons.icon('bolt', 16)} +1 énergie</button>
          <button class="btn ghost" data-switch ${canSwitch ? '' : 'disabled'}>${App.icons.icon('swap', 16)} Changer</button></div>`;
      $('.bt-actions').classList.remove('in'); void $('.bt-actions').offsetWidth; $('.bt-actions').classList.add('in');
      const done = (v) => { ov.removeEventListener('click', h); $('.bt-actions').innerHTML = ''; ov.classList.remove('pick-bench'); resolve(v); };
      const h = (e) => {
        if (over) return;
        const at2 = e.target.closest('[data-atk]'); if (at2 && !at2.disabled) { done({ type: 'attack', i: +at2.dataset.atk }); return; }
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
    const playerReplace = () => new Promise((resolve) => {
      log('Ton Pokémon est K.O. : touche le suivant sur ton banc.');
      ov.classList.add('pick-bench');
      const h = (e) => {
        const bb = e.target.closest('[data-bench="P"]'); if (!bb) return;
        const i = +bb.dataset.i; if (P.team[i].ko) return;
        ov.removeEventListener('click', h); ov.classList.remove('pick-bench'); resolve(i);
      };
      ov.addEventListener('click', h);
    });

    const gain = (side) => {
      const f = B().active(side); f.energy += 1; App.sfx.energy();
      const c = cardEl(f);
      if (c) { c.querySelector('.bt-pips').outerHTML = pips(f.energy); const p = c.querySelector('.bt-pips i:last-child'); if (p) { p.classList.add('new'); burst(p, 'spark', { n: 6, spread: 0.35, col: '#ffc83d', size: 0.6 }); } }
      else drawActive(side);
    };
    const switchTo = async (side, i) => {
      App.sfx.swap();
      await leaveAnim(B().active(side), side);
      side.active = i; drawAll();
    };

    let resolveEnd;
    const ended = new Promise((r) => { resolveEnd = r; });
    function finish(win) {
      over = true;
      $('.bt-actions').innerHTML = '';
      const b = document.createElement('div');
      b.className = 'bt-end ' + (win ? 'win' : 'lose');
      b.innerHTML = `<div class="bt-end-box"><div class="bt-end-t">${win ? 'Victoire !' : 'Défaite…'}</div>
        <p>${win ? `Tu as battu le niveau ${L.n} · ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''}.${L.n < B().LEVELS.length ? ' Le niveau suivant est débloqué !' : ' Tu es une vraie Légende !'}` : quit ? 'Tu as abandonné. Retente ta chance !' : 'L’ordinateur a gagné cette fois. Change d’équipe ou charge tes attaques plus tôt !'}</p>
        <div class="row" style="justify-content:center;gap:8px"><button class="btn primary" data-again>Rejouer</button><button class="btn ghost" data-back>Retour</button></div></div>`;
      ov.appendChild(b);
      if (win) { App.sfx.open(L.n >= 3 ? 5 : 3); confetti(); } else App.sfx.lose();
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-again]')) { close(); resolveEnd({ win, again: true }); }
        if (e.target.closest('[data-back]')) { close(); resolveEnd({ win, again: false }); }
      });
    }
    ov.querySelector('[data-quit]').addEventListener('click', () => { if (!over && confirm('Abandonner le combat ? (ça compte comme une défaite)')) { quit = true; finish(false); } });

    drawAll();
    log(`Le combat commence ! <b>${esc(B().active(P).name)}</b> contre <b>${esc(B().active(C).name)}</b>.`);
    App.sfx.unlock();
    await sleep(900);

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
        else if (act.type === 'charge') { gain(P); aura(B().active(P)); App.sfx.charge(); log(`<b>${esc(B().active(P).name)}</b> se concentre : +1 énergie.`); await sleep(750); }
        else { await switchTo(P, act.to); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(750); }
        if (over) break;
        if (B().active(C).ko) {
          if (!B().alive(C).length) { await sleep(300); finish(true); break; }
          C.active = B().aiReplace(C, P, L.n); drawAll(); log(`L’ordinateur envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(950);
        }
        if (over) break;
        await banner('Tour de l’ordinateur', 'foe');
        if (over) break;
        gain(C);
        await sleep(450);
        const mv = B().aiMove(C, P, L.n);
        if (over) break;
        if (mv.type === 'attack') await doAttack(C, P, mv.i);
        else if (mv.type === 'charge') { gain(C); aura(B().active(C)); App.sfx.charge(); log(`<b>${esc(B().active(C).name)}</b> se concentre : +1 énergie.`); await sleep(800); }
        else { await switchTo(C, mv.to); log(`L’ordinateur rappelle son Pokémon et envoie <b>${esc(B().active(C).name)}</b>.`); await sleep(950); }
        if (over) break;
        if (B().active(P).ko) {
          if (!B().alive(P).length) { await sleep(300); finish(false); break; }
          drawAll();
          const i = await playerReplace(); P.active = i; drawAll(); log(`Tu envoies <b>${esc(B().active(P).name)}</b> !`); await sleep(700);
        }
      }
    })();

    return ended;
  }

  // ---------- Choix des Pokémon d'une équipe ----------
  /** Statistiques de combat d'une carte (d'après la fiche détaillée TCGdex, gardée en cache) */
  async function combatStats(it) {
    const card = await ad().getCard(it.id);
    if (!/pok/i.test(card.category || 'Pokémon') || !card.hp) return { invalid: true };
    const f = B().fighter(card);
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

  async function pickTeam(current, name) {
    let body = App.util.openModal(App.ui.loading('Recherche de tes Pokémon…'));
    const items = await myPokemon();
    const imgs = await Promise.all(items.map((it) => App.col.displayImage(it, ad())));
    // statistiques : d'abord celles de la liste de la série (PV, type), puis la fiche complète (attaques)
    const rows = items.map((it, i) => ({ it, img: imgs[i].src, name: it.snap.name || '', hp: it._hp || null, type: it._type || null, maxDmg: null, minCost: null, power: null, weak: [], full: false }));
    const sel = current.filter((k) => rows.some((r) => r.it.key === k)).slice(0, 3);
    const F = { q: '', types: new Set(), sort: 'power', hp: 0, cost: 0 };

    return new Promise((resolve) => {
      let done = false, loaded = 0;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      body = App.util.openModal('', () => end(null));
      if (!rows.length) {
        body.innerHTML = `<div class="bt-pick"><h2>${esc(name)}</h2><p class="muted">Tu n’as pas encore de carte Pokémon dans ton Dex : tu joueras avec des Pokémon de prêt. Capture tes cartes pour jouer avec elles !</p>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="bt-ok">OK</button></div></div>`;
        body.querySelector('#bt-ok').addEventListener('click', () => { end([...current]); App.util.closeModal(); });
        return;
      }
      body.innerHTML = `<div class="bt-pick"><h2>${esc(name)} <span class="muted small" id="bt-cnt"></span></h2>
        <div class="bt-sel" id="bt-sel"></div>
        <div class="bt-filters">
          <input type="search" id="bt-q" placeholder="Rechercher un Pokémon…" autocomplete="off">
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

      const statsHtml = (r) => `${r.type ? `<i class="bt-dot" style="--tc:${typeColor(r.type)}" title="${esc((B().TYPE_INFO[r.type] || [''])[0])}"></i>` : ''}<b>${r.hp ? r.hp + ' PV' : '…'}</b>${r.maxDmg != null ? `<em title="Plus grosse attaque">⚔ ${r.maxDmg}</em>` : ''}`;
      const drawTile = (i) => { tiles[i].querySelector('.bt-pk-s').innerHTML = statsHtml(rows[i]); };
      rows.forEach((r, i) => drawTile(i));

      const drawTypes = () => {
        // les 11 types du jeu de cartes, toujours affichés (grisés si tu n'en as aucun)
        const cnt = {}; rows.forEach((r) => { if (r.type && !r.invalid) cnt[r.type] = (cnt[r.type] || 0) + 1; });
        $('#bt-ftypes').innerHTML = `<button class="bt-tchip ${F.types.size ? '' : 'on'}" data-t="">Tous les types</button>` + Object.keys(B().TYPE_INFO).map((t) => `<button class="bt-tchip ${F.types.has(t) ? 'on' : ''} ${cnt[t] ? '' : 'none'}" data-t="${t}" style="--tc:${typeColor(t)}" ${cnt[t] ? '' : 'disabled title="Aucun Pokémon de ce type dans ta collection"'}><i></i>${esc(B().TYPE_INFO[t][0])}${cnt[t] ? ` <small>${cnt[t]}</small>` : ''}</button>`).join('');
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
        $('#bt-fstate').textContent = `${shown} Pokémon sur ${rows.filter((r) => !r.invalid).length}`
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
        if (k) { const kk = k.dataset.k; const i = sel.indexOf(kk); if (i >= 0) sel.splice(i, 1); else if (sel.length < 3) sel.push(kk); else App.util.toast('3 Pokémon maximum : retire-en un d’abord'); apply(); return; }
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
  async function chooseTeam(m) {
    const imgs = await Promise.all(m.teams.map((t) => Promise.all(teamItems(t.keys).map((it) => App.col.displayImage(it, ad())))));
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      const body = App.util.openModal(`<div class="bt-pick"><h2>Avec quelle équipe ?</h2>
        <div class="bt-choose">${m.teams.map((t, i) => `<button class="bt-ch ${i === m.teamIdx ? 'on' : ''}" data-ch="${i}"><b>${esc(t.name)}</b>
          <span class="bt-ch-cards">${[0, 1, 2].map((j) => imgs[i][j] ? `<img src="${esc(imgs[i][j].src)}" alt="">` : '<i></i>').join('')}</span>
          ${imgs[i].length < 3 ? `<small class="muted">${imgs[i].length ? 'complétée' : 'que'} par des Pokémon de prêt</small>` : ''}</button>`).join('')}</div></div>`, () => end(null));
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) { end(+b.dataset.ch); App.util.closeModal(); } });
    });
  }

  App.views.match = {
    async render(el, params, alive) {
      let m = await getMatch();
      const draw = async () => {
        const teams = m.teams.map((t) => teamItems(t.keys));
        const imgs = await Promise.all(teams.map((l) => Promise.all(l.map((it) => App.col.displayImage(it, ad())))));
        if (!alive()) return;
        const unlocked = (n) => n === 1 || m.beaten[n - 1];
        el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Match</div>
          <div class="row" style="align-items:baseline;gap:12px"><h1 style="margin:0">Match</h1><span class="muted small">${m.wins} victoire${m.wins > 1 ? 's' : ''} · ${m.losses} défaite${m.losses > 1 ? 's' : ''}</span></div>
          <p class="muted" style="margin-top:6px">Tes cartes deviennent jouables : forme jusqu’à 3 équipes de 3 Pokémon de ta collection et affronte l’ordinateur. Les combats contre tes amis viendront plus tard.</p>
          <section class="panel bt-team-panel">
            <div class="row" style="align-items:baseline;gap:10px"><h2 style="margin:0">Mes équipes</h2><span class="muted small">Touche une équipe pour la choisir</span></div>
            <div class="bt-teams">${m.teams.map((t, i) => `<div class="bt-tm ${i === m.teamIdx ? 'on' : ''}" data-sel="${i}" role="button" tabindex="0">
                <div class="bt-tm-h"><b>${esc(t.name)}</b>${i === m.teamIdx ? `<span class="bt-tm-on">${App.icons.icon('check', 12)} Pour combattre</span>` : ''}</div>
                <div class="bt-tm-cards">${[0, 1, 2].map((j) => teams[i][j] ? `<img src="${esc(imgs[i][j].src)}" alt="" title="${esc(teams[i][j].snap.name)}" data-alt="${esc(teams[i][j].snap.name)}">` : '<span class="bt-tm-empty">+</span>').join('')}</div>
                <div class="bt-tm-f"><button class="btn sm" data-edit="${i}">${App.icons.icon('layers', 14)} ${teams[i].length ? 'Modifier' : 'Composer'}</button><button class="btn sm ghost" data-rename="${i}">Renommer</button></div>
              </div>`).join('')}</div>
            <p class="small muted" style="margin:10px 0 0">Une case vide est remplie par un Pokémon de prêt.</p>
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

      let busy = false;
      el.addEventListener('click', async (e) => {
        if (busy) return;
        const ed = e.target.closest('[data-edit]');
        if (ed) {
          const i = +ed.dataset.edit;
          busy = true;
          try {
            const t = await pickTeam(m.teams[i].keys, m.teams[i].name);
            if (t) { m = await getMatch(); m.teams[i].keys = t; m.teamIdx = i; await saveMatch(m); await draw(); }
          } finally { busy = false; }
          return;
        }
        const rn = e.target.closest('[data-rename]');
        if (rn) {
          const i = +rn.dataset.rename;
          busy = true;
          try {
            const v = await renameTeam(m.teams[i].name);
            if (v) { m = await getMatch(); m.teams[i].name = v.slice(0, 24); await saveMatch(m); await draw(); }
          } finally { busy = false; }
          return;
        }
        const sl = e.target.closest('[data-sel]');
        if (sl) {
          const i = +sl.dataset.sel; if (i === m.teamIdx) return;
          App.sfx.click();
          m = await getMatch(); m.teamIdx = i; await saveMatch(m); await draw(); return;
        }
        const lv = e.target.closest('[data-level]');
        if (lv && !lv.disabled) {
          busy = true;
          try {
            // plusieurs équipes prêtes : on demande laquelle
            const filled = m.teams.filter((t) => teamItems(t.keys).length).length;
            if (filled >= 2) {
              const idx = await chooseTeam(m);
              if (idx == null) return;
              if (idx !== m.teamIdx) { m = await getMatch(); m.teamIdx = idx; await saveMatch(m); await draw(); }
            }
            let again = true;
            while (again) {
              const t = m.teams[m.teamIdx];
              const r = await battle(+lv.dataset.level, teamItems(t.keys), t.name);
              if (!r) return;
              m = await getMatch();
              if (r.win) { m.wins++; m.beaten[+lv.dataset.level] = true; } else m.losses++;
              await saveMatch(m);
              if (alive()) await draw();
              again = r.again;
            }
          } finally { busy = false; }
        }
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-sel]')) e.target.click(); });
    },
  };
})();
