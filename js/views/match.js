/* Page « Combat » (#/combat, ancien « Match ») : combats simplifiés avec tes cartes, contre l'ordinateur (5 niveaux), 3 équipes */
(() => {
  const { esc } = App.util;
  const B = () => App.battle;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ad = () => App.games.get('pokemon');
  const TEAMS = 3, BAG_MAX = 6;
  const RM = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Données ----------
  /** profile.match = { teams:[{name, keys:[3 clés]}×3], teamIdx, team (= équipe choisie, pour les anciennes versions), beaten, wins, losses } */
  function normMatch(m) {
    m = Object.assign({ team: [], beaten: {}, beatenAdv: {}, wins: 0, losses: 0, mode: 'classic' }, m || {});
    if (m.mode !== 'adv') m.mode = 'classic';
    // victoires / défaites par mode (les anciennes comptent pour le mode basique)
    if (!m.stats) m.stats = { classic: { wins: m.wins || 0, losses: m.losses || 0 }, adv: { wins: 0, losses: 0 } };
    for (const k of ['classic', 'adv', 'online']) m.stats[k] = Object.assign({ wins: 0, losses: 0 }, m.stats[k] || {});
    let teams = Array.isArray(m.teams) ? m.teams : [];
    if (!teams.length && m.team && m.team.length) teams = [{ name: 'Équipe 1', keys: [...m.team] }];
    while (teams.length < TEAMS) teams.push({ name: `Équipe ${teams.length + 1}`, keys: [] });
    m.teams = teams.slice(0, TEAMS).map((t, i) => ({ name: String((t && t.name) || `Équipe ${i + 1}`).slice(0, 24), keys: ((t && t.keys) || []).slice(0, 3), bag: ((t && t.bag) || []).slice(0, BAG_MAX) }));
    m.teamIdx = Math.min(TEAMS - 1, Math.max(0, m.teamIdx | 0));
    return m;
  }
  async function getMatch() { const p = await App.col.getProfile(); return normMatch(p.match); }
  async function saveMatch(m) { m.team = [...m.teams[m.teamIdx].keys]; const p = await App.col.getProfile(); p.match = m; await App.col.saveProfile(p); }
  const teamItems = (keys) => keys.map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0);
  /** Cartes du sac encore possédées (une même carte peut y être plusieurs fois, dans la limite de ses exemplaires) */
  const bagItems = (keys) => { const n = {}; return (keys || []).map((k) => App.col.byKey(k)).filter((i) => i && i.qty > 0 && (n[i.key] = (n[i.key] || 0) + 1) <= i.qty); };

  /** Tes cartes Dresseur et Énergie (d'après les listes des séries) */
  async function myTrainers() {
    const items = App.col.all().filter((i) => i.qty > 0 && i.game === 'pokemon');
    const bySet = {};
    for (const it of items) (bySet[it.setId] = bySet[it.setId] || []).push(it);
    const out = [];
    await App.util.pool(Object.keys(bySet), 4, async (sid) => {
      const set = await ad().getSet(sid).catch(() => null);
      const cat = new Map((set ? set.cards : []).map((c) => [c.id, c.category]));
      for (const it of bySet[sid]) { const c = cat.get(it.id); if (c && !/pok/i.test(c)) out.push(it); }
    });
    return out.sort((a, b) => (a.snap.name || '').localeCompare(b.snap.name || '', 'fr'));
  }

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
    return B().fighter(card, { img: img.src, imgOff: card.image ? `${card.image}/high.webp` : '', mine: true });
  }
  async function fromId(id, extra = {}) {
    const card = await ad().getCard(id);
    const off = card.image ? `${card.image}/high.webp` : '';
    return B().fighter(card, { img: off, imgOff: off, ...extra });
  }
  const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  // ---------- Morceaux d'interface ----------
  const typeColor = (t) => (B().TYPE_INFO[t] || ['?', '#dfe4ee'])[1];
  const typeChip = (t) => { const [n, c] = B().TYPE_INFO[t] || ['?', '#999']; return `<span class="bt-type" style="--tc:${c}">${esc(n)}</span>`; };
  const pips = (n) => `<span class="bt-pips" title="${n} énergie${n > 1 ? 's' : ''}">${Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('')}${n > 8 ? `<b>+${n - 8}</b>` : ''}</span>`;
  const costPips = (n) => (n ? Array.from({ length: n }, () => '<i></i>').join('') : '<small>0</small>');
  const hpCls = (r) => (r < 0.3 ? 'low' : r < 0.6 ? 'mid' : '');

  // ---------- Écran de combat ----------
  /**
   * Combat. Contre l'ordinateur (level 1…5), ou contre un ami (opts.online = { link, rand, foeName, first: 'P'|'C', mine, foe, bagP, bagC }) :
   * les décisions de l'adversaire arrivent alors par link.next() au lieu de l'IA, et les miennes partent par link.send().
   */
  async function battle(level, teamItemsList, teamName, opts = {}) {
    const ADV = !!opts.adv, BC = App.battleCards, ON = opts.online || null;
    const ov = document.createElement('div');
    ov.className = 'bt-ov' + (ADV ? ' adv' : '') + (ON ? ' online' : '');
    ov.innerHTML = `<div class="bt-load">${App.ui.loading('Préparation du combat…')}</div>`;
    document.body.appendChild(ov); document.body.classList.add('cap-lock');
    const close = () => { ov.remove(); document.body.classList.remove('cap-lock'); if (ON) ON.link.close(); };
    const L = ON ? { n: 0, name: ON.foeName, color: '#34d5ff' } : B().LEVELS[level - 1];
    const rnd = ON ? ON.rand : Math.random;
    const foeWho = ON ? ON.foeName : 'L’ordinateur';

    // équipes
    let mine = [], foe = [];
    if (ON) { mine = ON.mine; foe = ON.foe; }
    else try {
      mine = (await Promise.all(teamItemsList.map((it) => fromItem(it).catch(() => null)))).filter(Boolean);
      const loan = pick(B().LEVELS[0].pool, 6);
      while (mine.length < 3 && loan.length) { const f = await fromId(loan.shift(), { loan: true }).catch(() => null); if (f) mine.push(f); }
      foe = (await Promise.all(pick(L.pool, L.strong ? 8 : 5).map((id) => fromId(id).catch(() => null)))).filter(Boolean);
      foe = (L.strong ? foe.sort((a, b) => B().power(b) - B().power(a)) : foe).slice(0, 3);
      if (foe.length < 3 || mine.length < 1) throw new Error('cartes introuvables (connexion ?)');
    } catch (e) { close(); App.util.toast('Combat impossible : ' + e.message, 4000); return null; }
    if (L.bonus) foe.forEach((f) => { f.energy += L.bonus; });

    const P = { team: mine, active: 0, bag: [] }, C = { team: foe, active: 0, bag: [] };
    let over = false, turn = 0, quit = false;
    if (ON) { if (ADV) { P.bag = ON.bagP || []; C.bag = ON.bagC || []; } }
    else if (ADV) {
      // sacs : le tien (ou un sac de prêt) et celui de l'ordinateur
      const load = (id, extra) => ad().getCard(id).then((c) => BC.bagCard(c, extra)).catch(() => null);
      P.bag = (await Promise.all((opts.bag || []).map(async (it) => {
        try { const card = await ad().getCard(it.id); const img = await App.col.displayImage(it, ad(), 'high'); return BC.bagCard(card, { img: img.src }); } catch (e) { return null; }
      }))).filter(Boolean);
      if (!P.bag.length) P.bag = (await Promise.all(BC.loanBag(mine[0].type).map((id) => load(id, { loan: true })))).filter(Boolean);
      C.bag = (await Promise.all(BC.aiBag(L.n, foe[0].type).map((id) => load(id)))).filter(Boolean);
    }

    ov.innerHTML = `
      <div class="bt-top"><span class="bt-lvl" style="--lc:${L.color}">${ON ? `${App.icons.icon('users', 13)} Contre ${esc(L.name)}` : `Niveau ${L.n} · ${esc(L.name)}`}</span>${ON ? '<span class="bt-net small" hidden>Connexion…</span>' : ''}${teamName ? `<span class="bt-tname muted small">${esc(teamName)}</span>` : ''}<span class="spacer"></span>${ADV ? '<span class="bt-foebag small muted"></span>' : ''}<button class="btn sm ghost" data-quit>Abandonner</button></div>
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
            <div class="bt-stats"><span><b class="bt-hpn">${Math.max(0, prev)}</b> / <span class="bt-hpmax">${f.maxHp}</span> PV</span>${pips(f.energy)}</div>${ADV ? `<div class="bt-tags">${tagsHtml(side)}</div>` : ''}</div></div>`;
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
      floatTxt(d, r.dmg ? `−${r.dmg}` : r.shield ? 'Bloqué !' : 'Raté !', r.weak ? 'weak' : r.dmg ? (strong ? 'big' : '') : 'miss');
      const coinTxt = r.coins ? ` <span class="bt-coins">${r.coins.map((c) => (c ? '🟡 face' : '⚪ pile')).join(' · ')}</span>` : '';
      log(`<b>${esc(a.name)}</b> utilise <b>${esc(att.name)}</b> : ${r.dmg} dégâts${r.weak ? ' <span class="bt-eff">Super efficace !</span>' : ''}${r.resist ? ' <span class="muted">(résistance)</span>' : ''}${r.bonus ? ` <span class="bt-eff">(+${r.bonus} bonus)</span>` : ''}${r.shield ? ` <span class="muted">(−${r.shield} bouclier)</span>` : ''}${coinTxt}`);
      await sleep(260);
      // barre de PV : mise à jour sur place (animée)
      updateHp(other); drawBench(other);
      const ac2 = cardEl(a); if (ac2) ac2.querySelector('.bt-pips').outerHTML = pips(a.energy);
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
    const idleBag = () => {
      if (!ADV) return '';
      const left = P.bag.map((c, i) => ({ c, i })).filter((x) => !x.c.used);
      return left.length ? `<div class="bt-bag idle"><span class="bt-bag-h">Ton sac · à ton tour</span>${left.map(({ c, i }) =>
        `<button type="button" class="bt-bc off" data-peek="${i}" title="${esc(c.name)} : ${esc(c.fx.desc)}"><img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}"><span><b>${esc(c.name)}</b><small>${esc(c.fx.short)}</small></span></button>`).join('')}</div>` : '';
    };
    const showIdle = () => { if (!over) $('.bt-actions').innerHTML = idleBag(); };
    ov.addEventListener('click', (e) => {
      const p = e.target.closest('[data-peek]'); if (!p) return;
      const c = P.bag[+p.dataset.peek]; if (c) App.util.toast(`${c.name} : ${c.fx.desc}`, 3500);
    });

    /** Actions du joueur : on attend son choix */
    const playerChoice =(cardUsed = false) => new Promise((resolve) => {
      const a = B().active(P), foeA = B().active(C);
      const canSwitch = B().bench(P).length > 0;
      const left = P.bag.map((c, i) => ({ c, i })).filter((x) => !x.c.used);
      const bagHtml = ADV && left.length ? `<div class="bt-bag"><span class="bt-bag-h">${cardUsed ? 'Carte jouée ✓' : 'Sac · 1 carte par tour'}</span>${left.map(({ c, i }) => {
        const ok = !cardUsed && BC.playable(c, P, C);
        return `<button class="bt-bc ${ok ? '' : 'off'}" data-card="${i}" ${ok ? '' : 'disabled'} title="${esc(c.name)} : ${esc(c.fx.desc)}"><img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}"><span><b>${esc(c.name)}</b><small>${esc(c.fx.short)}</small></span></button>`;
      }).join('')}</div>` : '';
      $('.bt-actions').innerHTML = bagHtml + `<div class="bt-atks">${a.attacks.map((x, i) => {
        const ok = x.cost <= a.energy, exp = Math.round(B().expected(x, a, foeA));
        return `<button class="bt-atk ${ok ? '' : 'off'}" data-atk="${i}" ${ok ? '' : 'disabled'} title="${esc(x.text)}" style="--tc:${typeColor(a.type)}">
          <span class="bt-cost">${costPips(x.cost)}</span><b>${esc(x.name)}</b><span class="bt-dmg">${x.noDamage ? '10' : x.base + (x.mode === 'x' ? '×' : x.mode === '+' ? '+' : '')}${exp > x.base * 1.4 ? ' <em>×2</em>' : ''}</span></button>`;
      }).join('')}</div>
        <div class="bt-more"><button class="btn" data-charge>${App.icons.icon('bolt', 16)} +1 énergie</button>
          <button class="btn ghost" data-switch ${canSwitch ? '' : 'disabled'}>${App.icons.icon('swap', 16)} Changer</button></div>`;
      $('.bt-actions').classList.remove('in'); void $('.bt-actions').offsetWidth; $('.bt-actions').classList.add('in');
      const done = (v) => { ov.removeEventListener('click', h); $('.bt-actions').innerHTML = idleBag(); ov.classList.remove('pick-bench'); resolve(v); };
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
    const playerReplace = (msg = 'Ton Pokémon est K.O. : touche le suivant sur ton banc.', notActive = false) => new Promise((resolve) => {
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
      if (c) { c.querySelector('.bt-pips').outerHTML = pips(f.energy); const p = c.querySelector('.bt-pips i:last-child'); if (p) { p.classList.add('new'); burst(p, 'spark', { n: 6, spread: 0.35, col: '#ffc83d', size: 0.6 }); } }
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
    const refreshPips = (f) => { const c = cardEl(f); if (c) c.querySelector('.bt-pips').outerHTML = pips(f.energy); };
    const drawFoeBag = () => { const el = $('.bt-foebag'); if (el) { const n = C.bag.filter((c) => !c.used).length; el.textContent = n ? `Sac adverse : ${n} carte${n > 1 ? 's' : ''}` : ''; } };
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
      d.innerHTML = `<img src="${esc(c.img)}" alt="" data-alt="${esc(c.name)}"><div><b>${esc(c.name)}</b><small>${esc(c.fx.desc)}</small></div>`;
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
      over = true;
      $('.bt-actions').innerHTML = '';
      if (ON) { ON.link.send({ kind: quit ? 'quit' : 'over', win: !!win }); ON.link.flush(); }
      const b = document.createElement('div');
      b.className = 'bt-end ' + (win ? 'win' : 'lose');
      const txt = ON
        ? (win ? (why === 'quit' ? `${esc(L.name)} a abandonné : victoire !` : `Tu as battu ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''} !`)
          : quit ? 'Tu as abandonné.' : `${esc(L.name)} a gagné cette fois. Demande-lui une revanche !`)
        : (win ? `Tu as battu le niveau ${L.n} · ${esc(L.name)} en ${turn} tour${turn > 1 ? 's' : ''}.${L.n < B().LEVELS.length ? ' Le niveau suivant est débloqué !' : ' Tu es une vraie Légende !'}` : quit ? 'Tu as abandonné. Retente ta chance !' : 'L’ordinateur a gagné cette fois. Change d’équipe ou charge tes attaques plus tôt !');
      b.innerHTML = `<div class="bt-end-box"><div class="bt-end-t">${win ? 'Victoire !' : 'Défaite…'}</div>
        <p>${txt}</p>
        <div class="row" style="justify-content:center;gap:8px">${ON ? '' : '<button class="btn primary" data-again>Rejouer</button>'}<button class="btn ${ON ? 'primary' : 'ghost'}" data-back>Retour</button></div></div>`;
      ov.appendChild(b);
      if (win) { App.sfx.open(L.n >= 3 || ON ? 5 : 3); confetti(); } else App.sfx.lose();
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-again]')) { close(); resolveEnd({ win, again: true }); }
        if (e.target.closest('[data-back]')) { close(); resolveEnd({ win, again: false }); }
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
      const mv = await ON.link.next();
      clearInterval(t);
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
      await banner('À toi !', 'me');
      if (over) return false;
      startTurn(P);
      gain(P);
      let act, used = false;
      for (;;) {
        act = await playerChoice(used);
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

  /** Choisir le sac de cartes Dresseur / Énergie d'une équipe */
  async function pickBag(current, name) {
    let body = App.util.openModal(App.ui.loading('Recherche de tes cartes Dresseur et Énergie…'));
    const list = await myTrainers();
    const imgs = await Promise.all(list.map((it) => App.col.displayImage(it, ad())));
    const sel = bagItems(current).map((i) => i.key).slice(0, BAG_MAX);
    const fx = {};
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      body = App.util.openModal('', () => end(null));
      const loanTxt = 'Sans carte, tu joues avec un sac de prêt : Potion, PlusPower, Transfert et une Énergie du type de ton 1er Pokémon.';
      if (!list.length) {
        body.innerHTML = `<div class="bt-pick"><h2>Sac · ${esc(name)}</h2><p class="muted">Tu n’as pas encore de carte Dresseur ou Énergie dans ton Dex. ${loanTxt} Capture tes cartes Dresseur et Énergie pour les utiliser !</p>
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="bt-ok">OK</button></div></div>`;
        body.querySelector('#bt-ok').addEventListener('click', () => { end(null); App.util.closeModal(); });
        return;
      }
      body.innerHTML = `<div class="bt-pick"><h2>Sac · ${esc(name)} <span class="muted small" id="bt-cnt"></span></h2>
        <p class="small muted" style="margin:4px 0 0">Jusqu’à ${BAG_MAX} cartes Dresseur ou Énergie. En combat « Avec Dresseurs », tu peux en jouer une par tour, chacune une seule fois. Touche une carte plusieurs fois pour en mettre plusieurs exemplaires (si tu les as). ${loanTxt}</p>
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
        try { const card = await ad().getCard(it.id); fx[it.key] = App.battleCards.effectOf(card); } catch (e) { return; }
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
    const imgs = await Promise.all(m.teams.map((t) => Promise.all(teamItems(t.keys).map((it) => App.col.displayImage(it, ad())))));
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; resolve(v); };
      const body = App.util.openModal(`<div class="bt-pick"><h2>${esc(o.title || 'Avec quelle équipe ?')}</h2>${o.sub ? `<p class="small muted" style="margin:-4px 0 10px">${o.sub}</p>` : ''}
        <div class="bt-choose">${m.teams.map((t, i) => `<button class="bt-ch ${i === m.teamIdx ? 'on' : ''}" data-ch="${i}"><b>${esc(t.name)}</b>
          <span class="bt-ch-cards">${[0, 1, 2].map((j) => imgs[i][j] ? `<img src="${esc(imgs[i][j].src)}" alt="">` : '<i></i>').join('')}</span>
          ${imgs[i].length < 3 ? `<small class="muted">${imgs[i].length ? 'complétée' : 'que'} par des Pokémon de prêt</small>` : ''}</button>`).join('')}</div></div>`, () => end(null));
      body.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) { end(+b.dataset.ch); App.util.closeModal(); } });
    });
  }

  // ---------- Contre un ami (salon avec code, js/duel.js) ----------
  /** Équipe prête à envoyer : mes Pokémon (complétés par des Pokémon de prêt) et mon sac en mode Avancé */
  async function onlineTeam(t, adv) {
    const fs = (await Promise.all(teamItems(t.keys).map((it) => fromItem(it).catch(() => null)))).filter(Boolean);
    const loan = pick(B().LEVELS[0].pool, 6);
    while (fs.length < 3 && loan.length) { const f = await fromId(loan.shift(), { loan: true }).catch(() => null); if (f) fs.push(f); }
    if (!fs.length) throw new Error('cartes introuvables (connexion ?)');
    let bag = [];
    if (adv) {
      const BC = App.battleCards;
      bag = (await Promise.all(bagItems(t.bag).map((it) => ad().getCard(it.id).then((c) => BC.bagCard(c)).catch(() => null)))).filter(Boolean);
      if (!bag.length) bag = (await Promise.all(BC.loanBag(fs[0].type).map((id) => ad().getCard(id).then((c) => BC.bagCard(c, { loan: true })).catch(() => null)))).filter(Boolean);
    }
    return { imgs: fs.map((f) => f.img), wire: { name: t.name, fighters: fs.map(App.duel.wireFighter), bag: bag.map(App.duel.wireBag) } };
  }
  /** Lance le combat à partir de l'état du salon (les deux équipes passent par le même filtre : mêmes chiffres des deux côtés) */
  async function startDuel(s, imgs) {
    const D = App.duel;
    const mine = s.myTeam.fighters, foe = s.foeTeam.fighters;
    if (!mine.length || !foe.length) throw new Error('équipe vide');
    mine.forEach((f, i) => { if (imgs[i]) f.img = imgs[i]; });
    const link = D.link(s.code);
    return battle(0, [], s.myTeam.name, {
      adv: s.mode === 'adv',
      online: { link, rand: D.rng(s.seed), foeName: s.foeName, first: s.meHost === D.hostFirst(s.seed) ? 'P' : 'C', mine, foe, bagP: s.myTeam.bag, bagC: s.foeTeam.bag },
    });
  }
  /** Choix de l'équipe pour un combat entre amis (renvoie l'index, ou null) */
  const modeName = (mode) => (mode === 'adv' ? 'Avancé (avec sac)' : 'Basique');

  /**
   * Dans le salon, les deux dresseurs sont là : chacun choisit son équipe (sans voir celle de l'autre),
   * puis on attend que l'autre ait choisi ; le combat commence quand les deux sont prêts.
   * Quitter ici ferme le salon (ni victoire ni défaite).
   */
  function duelLobby(code, m, mode, foeName) {
    const D = App.duel;
    return new Promise((resolve) => {
      let finished = false, starting = false, team = null, foeReady = false;
      const end = (v) => { if (finished) return; finished = true; stop(); resolve(v); };
      const leave = () => { if (finished || starting) return; D.cancel(code); end(null); };
      const stop = D.waitStart(code, async (s) => {
        if (finished || !team) return;
        starting = true; App.util.closeModal(); App.sfx.open(3);
        try { end(await startDuel(s, team.imgs)); } catch (e) { App.util.toast('Combat impossible : ' + e.message, 4500); end(null); }
      }, (e) => { if (finished || starting) return; finished = true; App.util.closeModal(); App.util.toast(e.message, 4500); resolve(null); },
      (s) => {
        if (s.foeReady === foeReady) return;
        foeReady = s.foeReady;
        const el = document.getElementById('bt-lobby-foe');
        if (el) el.innerHTML = foeReady ? `<b style="color:var(--ok, #3ddc97)">${esc(foeName)} a choisi son équipe ✓</b>` : `${esc(foeName)} choisit son équipe…`;
      });
      (async () => {
        const idx = await chooseTeam(m, {
          title: 'Choisis ton équipe',
          sub: `Salon ${code} · contre <b>${esc(foeName)}</b> · mode ${esc(modeName(mode))}. ${esc(foeName)} ne verra ton équipe qu’au début du combat.`,
        });
        if (finished) return;
        if (idx == null) { leave(); return; }
        App.util.openModal(App.ui.loading('Préparation de ton équipe…'), leave);
        try { team = await onlineTeam(m.teams[idx], mode === 'adv'); if (!finished) await D.setTeam(code, team.wire); }
        catch (e) { if (finished || starting) return; App.util.closeModal(); App.util.toast('Équipe impossible : ' + e.message, 4500); D.cancel(code); end(null); return; }
        if (finished || starting) return;
        App.util.openModal(`<div class="bt-pick bt-room">
            <h2>${App.icons.icon('users', 18)} Salon ${esc(code)}</h2>
            <p class="small muted" style="margin:2px 0 12px">Mode ${esc(modeName(mode))}</p>
            <p style="margin:0 0 6px"><b style="color:var(--ok, #3ddc97)">${App.icons.icon('check', 14)} Ton équipe « ${esc(m.teams[idx].name)} » est prête</b></p>
            <div class="bt-wait" style="justify-content:center"><span class="bt-wait-dots"><i></i><i></i><i></i></span> <span id="bt-lobby-foe">${foeReady ? `${esc(foeName)} a choisi son équipe ✓` : `${esc(foeName)} choisit son équipe…`}</span></div>
            <div class="row" style="justify-content:center;margin-top:8px"><button class="btn ghost sm" id="bt-lobby-quit">Quitter le salon</button></div>
          </div>`, leave);
        document.getElementById('bt-lobby-quit').addEventListener('click', () => { leave(); App.util.closeModal(); });
      })();
    });
  }

  /** Créer un salon : montre le code, attend l'ami, puis lance le combat */
  async function duelCreate(m) {
    const D = App.duel;
    let body = App.util.openModal(App.ui.loading('Préparation du salon…'));
    let code;
    try { code = await D.create(m.mode); }
    catch (e) { App.util.closeModal(); App.util.toast('Salon impossible : ' + e.message, 4500); return null; }
    const link = `${location.origin}${location.pathname}#/combat?salon=${code}`;
    return new Promise((resolve) => {
      let done = false, stop = null;
      const end = (v) => { if (done) return; done = true; if (stop) stop(); resolve(v); };
      body = App.util.openModal(`<div class="bt-pick bt-room">
          <h2>${App.icons.icon('users', 18)} Ton salon</h2>
          <p class="small muted" style="margin:2px 0 10px">Mode ${esc(modeName(m.mode))} · vous choisirez vos équipes une fois ensemble dans le salon</p>
          <button type="button" class="bt-code" id="bt-room-code" title="Copier le code" aria-label="Code du salon : toucher pour le copier">${code.split("").map((c) => `<span>${esc(c)}</span>`).join("")}</button>
          <div class="bt-code-hint small muted" id="bt-code-hint">Touche le code pour le copier</div>
          <p class="small" style="text-align:center;margin:10px 0">Donne ce code à ton adversaire : page <b>Combat</b> › « Rejoindre avec un code ». Il lui faut juste un compte CollecDex.</p>
          <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn" id="bt-room-copy">${App.icons.icon("copy", 15)} Copier le code</button><button class="btn primary" id="bt-room-share">${App.icons.icon("share", 15)} ${navigator.share ? "Envoyer" : "Copier le lien"}</button></div>
          <div class="bt-wait" style="justify-content:center;margin-top:14px"><span class="bt-wait-dots"><i></i><i></i><i></i></span> En attente de ton adversaire…</div>
          <div class="row" style="justify-content:center;margin-top:8px"><button class="btn ghost sm" id="bt-room-cancel">Fermer le salon</button></div>
        </div>`, () => { if (!done) { D.cancel(code); end(null); } });
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
        const text = `Viens m’affronter sur CollecDex ! Code du salon : ${code}`;
        if (navigator.share) { navigator.share({ title: 'Combat CollecDex', text, url: link }).catch(() => {}); return; }
        try { await navigator.clipboard.writeText(`${text}\n${link}`); App.util.toast('Lien copié ✓'); } catch (e) { App.util.toast(code); }
      });
      body.querySelector('#bt-room-cancel').addEventListener('click', () => { D.cancel(code); end(null); App.util.closeModal(); });
      stop = D.waitJoin(code, async (s) => {
        if (done) return;
        done = true; App.util.closeModal(); App.sfx.click();
        App.util.toast(`${s.foeName} est dans le salon !`);
        resolve(await duelLobby(code, m, m.mode, s.foeName));
      }, (e) => { if (!done) { App.util.closeModal(); App.util.toast(e.message, 4500); end(null); } });
    });
  }

  /** Rejoindre le salon d'un ami avec son code */
  async function duelJoin(m, preset = '') {
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
    return duelLobby(code.code, m, code.mode, code.host);
  }

  App._duelTest = { startDuel }; // pour les tests (deux combats simulés dans la même page)

  App.views.match = {
    async render(el, params, alive) {
      let m = await getMatch();
      let teamsModal = null; // corps de la fenêtre « Mes équipes » (téléphone), s'il est ouvert
      let view = null;       // données de la dernière page dessinée

      const teamCard = (i) => {
        const t = m.teams[i], items = view.teams[i], imgs = view.imgs[i], on = i === m.teamIdx, adv = m.mode === 'adv';
        const bag = view.bags[i];
        return `<div class="bt-tm ${on ? 'on' : ''}">
          <div class="bt-tm-h"><b>${esc(t.name)}</b>${on ? `<span class="bt-tm-on">${App.icons.icon('check', 12)} Pour combattre</span>` : `<button class="btn sm ghost bt-tm-pick" data-sel="${i}">Choisir</button>`}</div>
          <div class="bt-tm-cards">${[0, 1, 2].map((j) => items[j] ? `<img src="${esc(imgs[j].src)}" alt="" title="${esc(items[j].snap.name)}" data-alt="${esc(items[j].snap.name)}">` : '<span class="bt-tm-empty">+</span>').join('')}</div>
          ${adv ? `<div class="bt-tm-bag"><span class="small muted">Sac : ${bag.length ? `${bag.length} carte${bag.length > 1 ? 's' : ''}` : 'prêt'}</span><span class="bt-tm-bagimgs">${view.bagImgs[i].map((b, j) => `<img src="${esc(b.src)}" alt="" title="${esc(bag[j].snap.name)}">`).join('')}</span></div>` : ''}
          <div class="bt-tm-f"><button class="btn sm" data-edit="${i}">${App.icons.icon('layers', 14)} ${items.length ? 'Modifier' : 'Composer'}</button>${adv ? `<button class="btn sm" data-bag="${i}">Sac</button>` : ''}<button class="btn sm ghost" data-rename="${i}">Renommer</button></div>
        </div>`;
      };
      const teamsHtml = () => `<div class="bt-teams">${m.teams.map((t, i) => teamCard(i)).join('')}</div>`;

      const draw = async () => {
        const teams = m.teams.map((t) => teamItems(t.keys));
        const bags = m.teams.map((t) => bagItems(t.bag));
        const [imgs, bagImgs] = await Promise.all([
          Promise.all(teams.map((l) => Promise.all(l.map((it) => App.col.displayImage(it, ad()))))),
          Promise.all(bags.map((l) => Promise.all(l.map((it) => App.col.displayImage(it, ad()))))),
        ]);
        if (!alive()) return;
        view = { teams, bags, imgs, bagImgs };
        const adv = m.mode === 'adv', beaten = adv ? m.beatenAdv : m.beaten, st = m.stats[m.mode];
        const unlocked = (n) => n === 1 || beaten[n - 1];
        const ti = m.teamIdx, curItems = teams[ti];
        // téléphone : onglets d'équipes + l'équipe choisie
        const mobileTeam = `<section class="bt-mteam">
            <div class="bt-mtabs" role="tablist">${m.teams.map((t, i) => `<button class="${i === ti ? 'on' : ''}" data-sel="${i}" role="tab">${esc(t.name)}<small>${teams[i].length}/3</small></button>`).join('')}</div>
            <div class="bt-mbody">
              <div class="bt-mcards" data-edit="${ti}">${[0, 1, 2].map((j) => curItems[j] ? `<img src="${esc(imgs[ti][j].src)}" alt="" data-alt="${esc(curItems[j].snap.name)}">` : '<span class="bt-tm-empty">+</span>').join('')}</div>
              <div class="bt-mact">
                <button class="btn sm" data-edit="${ti}">${App.icons.icon('layers', 14)} ${curItems.length ? 'Modifier' : 'Composer'}</button>
                ${adv ? `<button class="btn sm" data-bag="${ti}">Sac${bags[ti].length ? ` · ${bags[ti].length}` : ''}</button>` : ''}
                <button class="btn sm ghost" data-rename="${ti}">Renommer</button>
              </div>
            </div>
            ${adv ? `<div class="bt-mbag small muted">${bags[ti].length ? `<span class="bt-tm-bagimgs">${bagImgs[ti].map((b) => `<img src="${esc(b.src)}" alt="">`).join('')}</span>` : 'Sac vide : sac de prêt'}</div>` : ''}
          </section>`;
        el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Combat</div>
          <div class="bt-head"><h1>Combat</h1><span class="muted small">${st.wins} victoire${st.wins > 1 ? 's' : ''} · ${st.losses} défaite${st.losses > 1 ? 's' : ''}</span></div>
          <div class="bt-modes" role="tablist">
            <button class="${adv ? '' : 'on'}" data-mode="classic" role="tab">Basique</button>
            <button class="${adv ? 'on' : ''}" data-mode="adv" role="tab">Avancé</button>
          </div>
          <p class="bt-hint small muted">${adv ? 'Avec un sac de cartes Dresseur et Énergie : une carte par tour.' : 'Tes Pokémon contre ceux de l’ordinateur.'}</p>
          ${mobileTeam}
          <section class="panel bt-team-panel">
            <h2 style="margin:0">Mes équipes</h2>
            ${teamsHtml()}
          </section>
          <section class="bt-duel">
            <div class="bt-duel-h"><span class="bt-duel-ic">${App.icons.icon('users', 20)}</span><div><b>Combat en ligne</b>
              <span class="small muted">${m.stats.online.wins || m.stats.online.losses ? `${m.stats.online.wins} victoire${m.stats.online.wins > 1 ? 's' : ''} · ${m.stats.online.losses} défaite${m.stats.online.losses > 1 ? 's' : ''}` : `Crée un salon et envoie le code à qui tu veux (il lui faut un compte), ou rejoins un salon : affrontez-vous en mode ${adv ? 'Avancé' : 'Basique'}.`}</span></div></div>
            ${App.cloud.user ? `<div class="bt-duel-b"><button class="btn primary" data-duel="create">${App.icons.icon('plus', 15)} Créer un salon</button><button class="btn" data-duel="join">Rejoindre avec un code</button></div>`
              : `<div class="bt-duel-b"><a class="btn" href="#/connexion">${App.icons.icon('user', 15)} Me connecter pour jouer en ligne</a></div>`}
          </section>
          <h2>Contre l’ordinateur</h2>
          <div class="bt-levels">${B().LEVELS.map((L) => `<button class="bt-level ${unlocked(L.n) ? '' : 'locked'} ${beaten[L.n] ? 'done' : ''}" data-level="${L.n}" style="--lc:${L.color}" ${unlocked(L.n) ? '' : 'disabled'}>
              <span class="bt-ln">${L.n}</span><div class="bt-ld"><b>${esc(L.name)}</b><span class="small muted">${unlocked(L.n) ? esc(L.desc) + (adv ? ` · sac de ${App.battleCards.aiBag(L.n, 'fire').length}` : '') : `Bats le niveau ${L.n - 1}`}</span></div>
              ${beaten[L.n] ? `<span class="bt-done">${App.icons.icon('check', 14)} Battu</span>` : unlocked(L.n) ? '<span class="btn sm primary">Combattre</span>' : `<span class="bt-lock">${App.icons.icon('lock', 16)}</span>`}</button>`).join('')}</div>
          <details class="bt-rules panel"><summary><b>Règles</b></summary>
            <ul class="small">
              <li>3 Pokémon par équipe : un qui combat, deux sur le banc. Une case vide est remplie par un Pokémon de prêt.</li>
              <li>À ton tour, ton Pokémon gagne <b>1 énergie</b>, puis une action : <b>attaquer</b>, <b>+1 énergie</b> ou <b>changer</b> de Pokémon.</li>
              <li>Une attaque coûte 1 énergie par symbole de la carte ; les énergies en plus restent pour la suite.</li>
              <li>Dégâts, <b>faiblesse</b> (×2) et <b>résistance</b> de la vraie carte. « 30× » : 30 par face sur 2 pièces ; « 20+ » : bonus si face ; attaque sans dégâts : 10.</li>
              <li>Mets K.O. les 3 Pokémon adverses pour gagner et débloquer le niveau suivant.</li>
              <li><b>Avancé</b> (niveaux à part) : un sac de 6 cartes Dresseur / Énergie max (sinon sac de prêt) ; une carte par tour avant l’action, chacune une seule fois. Énergie : +1 (+2 si même type). Dresseurs : effet simplifié (Potion soin 20, PlusPower +20 dégâts, Défenseur −20 dégâts subis, Transfert, Rafale de vent…) ; sinon Objet = soin 30, Supporter = +1 énergie, Outil = +20 PV, Stade = +10 dégâts 3 tours.</li>
            </ul></details>`;
        if (teamsModal && document.body.contains(teamsModal)) teamsModal.innerHTML = `<div class="bt-pick"><h2>Mes équipes</h2>${teamsHtml()}</div>`;
      };
      await draw();

      let busy = false;
      /** combat entre amis : créer ou rejoindre un salon, puis noter le résultat */
      const runDuel = async (how, preset) => {
        if (busy) return;
        if (!App.cloud.user) { location.hash = '#/connexion'; return; }
        busy = true;
        try {
          App.sfx.click();
          m = await getMatch();
          const r = how === 'create' ? await duelCreate(m) : await duelJoin(m, preset);
          if (!r || r.win == null) return;
          m = await getMatch();
          if (r.win) m.stats.online.wins++; else m.stats.online.losses++;
          await saveMatch(m);
          if (alive()) await draw();
        } finally { busy = false; }
      };
      /** actions sur les équipes (page ou fenêtre « Mes équipes ») */
      const onTeam = async (e) => {
        const ed = e.target.closest('[data-edit]'), rn = e.target.closest('[data-rename]'), bg = e.target.closest('[data-bag]'), sl = e.target.closest('[data-sel]');
        if (!ed && !rn && !bg && !sl) return false;
        busy = true;
        try {
          if (sl) {
            App.sfx.click();
            m = await getMatch(); m.teamIdx = +sl.dataset.sel; await saveMatch(m); await draw();
            return true;
          }
          teamsModal = null; // la fenêtre va être remplacée
          if (ed) {
            const i = +ed.dataset.edit;
            const t = await pickTeam(m.teams[i].keys, m.teams[i].name);
            if (t) { m = await getMatch(); m.teams[i].keys = t; m.teamIdx = i; await saveMatch(m); }
          } else if (rn) {
            const i = +rn.dataset.rename;
            const v = await renameTeam(m.teams[i].name);
            if (v) { m = await getMatch(); m.teams[i].name = v.slice(0, 24); await saveMatch(m); }
          } else if (bg) {
            const i = +bg.dataset.bag;
            const b = await pickBag(m.teams[i].bag, m.teams[i].name);
            if (b) { m = await getMatch(); m.teams[i].bag = b; await saveMatch(m); }
          }
          await draw();
        } finally { busy = false; }
        return true;
      };

      el.addEventListener('click', async (e) => {
        if (busy) return;
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
            // plusieurs équipes prêtes : on demande laquelle
            const filled = m.teams.filter((t) => teamItems(t.keys).length).length;
            if (filled >= 2) {
              const idx = await chooseTeam(m);
              if (idx == null) return;
              if (idx !== m.teamIdx) { m = await getMatch(); m.teamIdx = idx; await saveMatch(m); await draw(); }
            }
            let again = true;
            while (again) {
              const t = m.teams[m.teamIdx], adv = m.mode === 'adv';
              const r = await battle(+lv.dataset.level, teamItems(t.keys), t.name, { adv, bag: bagItems(t.bag) });
              if (!r) return;
              m = await getMatch();
              const st = m.stats[adv ? 'adv' : 'classic']; if (r.win) { st.wins++; m.wins++; (adv ? m.beatenAdv : m.beaten)[+lv.dataset.level] = true; } else { st.losses++; m.losses++; }
              await saveMatch(m);
              if (alive()) await draw();
              again = r.again;
            }
          } finally { busy = false; }
        }
      });

      // lien d'un ami (#/combat?salon=CODE) : on propose de rejoindre son salon
      if (params.query.salon) {
        const code = params.query.salon;
        history.replaceState(history.state, '', location.pathname + location.search + '#/combat');
        for (let i = 0; i < 20 && !App.cloud.user && alive(); i++) await sleep(200); // la connexion se rétablit au démarrage
        if (!alive()) return;
        if (App.cloud.user) runDuel('join', code);
        else App.util.toast('Connecte-toi pour rejoindre ce salon', 4000);
      }
    },
  };
})();
