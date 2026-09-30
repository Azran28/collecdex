/* Petits outils partagés par tout le site */
window.App = window.App || {};
App.views = App.views || {};
// numéro de version de cette mise en ligne (posé par stamp.ps1 / stamp.sh dans index.html)
window.APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '';

App.util = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Prix en dollars (TCGplayer, quand Cardmarket n'a pas de prix) : toujours convertis en euros.
  // Taux du jour (gardé 24 h), sinon le dernier connu, sinon un taux de secours.
  const FX_KEY = 'fx-usd-eur';
  let usdEur = 0.86;
  try { const s = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); if (s && s.r > 0.5 && s.r < 1.5) usdEur = s.r; } catch (e) { /* stockage indisponible */ }
  (async () => {
    try {
      const s = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
      if (s && Date.now() - s.t < 24 * 3600 * 1000) return;
      const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json');
      const x = +((await r.json()).usd || {}).eur;
      if (x > 0.5 && x < 1.5) { usdEur = x; localStorage.setItem(FX_KEY, JSON.stringify({ r: x, t: Date.now() })); }
    } catch (e) { /* hors ligne : on garde le dernier taux */ }
  })();
  /** Montant en euros (un prix en dollars est converti) */
  const toEur = (v, unit) => (v == null || isNaN(v) ? v : unit === 'USD' ? Math.round(v * usdEur * 100) / 100 : v);
  const money = (v, cur) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
  /** Montant affiché, toujours en euros */
  const euro = (v, unit = 'EUR') => (v == null || isNaN(v) ? '—' : money(toEur(v, unit), 'EUR'));
  /** Montant en dollars tel quel (pour montrer le prix d'origine) */
  const usd = (v) => (v == null || isNaN(v) ? '—' : money(v, 'USD'));

  const pct = (a, b) => (b ? Math.floor((a / b) * 1000) / 10 : 0);

  const dateFr = (d) => {
    if (!d) return '';
    const x = new Date(d);
    if (isNaN(x)) return d;
    return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const debounce = (fn, ms = 250) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  let toastTimer;
  const toast = (msg, ms = 2600) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), ms);
  };

  // ---- Modal ----
  let onModalClose = null;
  const openModal = (html, onClose) => {
    const m = document.getElementById('modal');
    // nouvel élément à chaque ouverture : les anciens écouteurs d'événements disparaissent
    const old = document.getElementById('modal-body');
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    fresh.innerHTML = html;
    m.hidden = false;
    m.querySelector('.modal-box').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    onModalClose = onClose || null;
    return fresh;
  };
  const closeModal = () => {
    const m = document.getElementById('modal');
    if (m.hidden) return;
    m.hidden = true;
    document.body.style.overflow = '';
    const cb = onModalClose; onModalClose = null;
    if (cb) cb();
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ---- Question « Tu es sûr ? » (remplace confirm() du navigateur) ----
  /**
   * ask({ title, text, ok, cancel, danger, icon }) → Promise<boolean>
   * ask({ title, text, choices: [{ label, value, kind: 'primary'|'danger'|'' }] }) → Promise<value|null> (null = annulé)
   * Par-dessus tout (fiches, capsules, combat). Toucher le fond ou Échap = annuler.
   */
  const ask = (o = {}) => new Promise((resolve) => {
    const choices = o.choices || [{ label: o.ok || 'Confirmer', value: true, kind: o.danger ? 'danger' : 'primary' }];
    const none = o.choices ? null : false;
    const el = document.createElement('div');
    el.className = 'ask' + (o.danger ? ' ask-danger' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="ask-bg"></div>
      <div class="ask-box">
        ${o.icon && App.icons ? `<div class="ask-ico">${App.icons.icon(o.icon, 26)}</div>` : ''}
        ${o.title ? `<h3 class="ask-title">${esc(o.title)}</h3>` : ''}
        ${o.text ? `<p class="ask-text">${esc(o.text).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="ask-btns">
          ${choices.map((c, i) => `<button type="button" class="btn ${c.kind === 'danger' ? 'ask-red' : c.kind === 'primary' ? 'primary' : ''}" data-ask="${i}">${esc(c.label)}</button>`).join('')}
          <button type="button" class="btn ghost" data-ask="x">${esc(o.cancel || 'Annuler')}</button>
        </div>
      </div>`;
    const done = (v) => {
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('ask-out');
      setTimeout(() => el.remove(), 180);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(none); } };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-ask]');
      if (b) done(b.dataset.ask === 'x' ? none : choices[+b.dataset.ask].value);
      else if (e.target.classList.contains('ask-bg')) done(none);
    });
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    const first = el.querySelector('[data-ask="0"]');
    if (first && matchMedia('(hover: hover)').matches) first.focus();
  });

  // ---- Images ----
  /** Réduit une photo (Blob/File) à maxSize px et renvoie un Blob JPEG */
  const resizeImage = (file, maxSize = 900, quality = 0.86) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });

  const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const dataURLToBlob = async (d) => (await fetch(d)).blob();

  /** Normalise un texte pour la recherche (minuscules, sans accents) */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /** Distance de Levenshtein (pour la reconnaissance de noms au scan) */
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  const similarity = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return 0; return 1 - lev(a, b) / Math.max(a.length, b.length); };

  /** Exécute des tâches asynchrones avec un nombre limité en parallèle */
  const pool = async (items, limit, worker, onProgress) => {
    let i = 0, done = 0;
    const run = async () => {
      while (i < items.length) {
        const idx = i++;
        try { await worker(items[idx], idx); } catch (e) { console.warn(e); }
        done++; onProgress && onProgress(done, items.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  };

  const numSort = (a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), 'fr', { numeric: true });
  };

  return { esc, $, $$, euro, usd, toEur, pct, dateFr, debounce, toast, ask, openModal, closeModal, resizeImage, blobToDataURL, dataURLToBlob, norm, similarity, lev, pool, numSort };
})();
