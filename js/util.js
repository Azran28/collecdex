/* Petits outils partagés par tout le site */
window.App = window.App || {};
App.views = App.views || {};

App.util = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const euro = (v, unit = 'EUR') => {
    if (v == null || isNaN(v)) return '—';
    const cur = unit === 'USD' ? 'USD' : 'EUR';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
  };

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

  return { esc, $, $$, euro, pct, dateFr, debounce, toast, openModal, closeModal, resizeImage, blobToDataURL, dataURLToBlob, norm, similarity, pool, numSort };
})();
