/* Icônes du site (traits simples, même style partout) et logo CollecDex */
App.icons = (() => {
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
    explore: '<rect x="3" y="7" width="12" height="15" rx="2"/><path d="M7 3.5h11a2 2 0 0 1 2 2V18"/>',
    capture: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><rect x="8.5" y="7" width="7" height="10" rx="1.3"/>',
    dex: '<rect x="3" y="3" width="7.5" height="9" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="9" rx="1.6"/><rect x="3" y="15" width="7.5" height="6" rx="1.6"/><rect x="13.5" y="15" width="7.5" height="6" rx="1.6"/>',
    trophy: '<path d="M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
    anchor: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M5 12H3a9 9 0 0 0 18 0h-2M8.5 10.5h7"/>',
    sparkles: '<path d="M11 3.5l1.7 4.4 4.4 1.7-4.4 1.7L11 15.7l-1.7-4.4-4.4-1.7 4.4-1.7z"/><path d="M18.5 14l.8 2.1 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    pyramid: '<path d="M12 3 2.5 20h19z"/><path d="M8.2 13.5c2.3-2.2 5.3-2.2 7.6 0-2.3 2.2-5.3 2.2-7.6 0z"/><circle cx="12" cy="13.5" r="1"/>',
    star: '<path d="M12 2.8l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 17l-5.8 3.3 1.4-6.4L2.7 9.5l6.5-.7z"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2-3-6-3-6-.5S10 8 12 8zm0 0c2-3 6-3 6-.5S14 8 12 8z"/>',
    shield: '<path d="M12 2.8 4.5 5.6v6c0 4.6 3.1 8.1 7.5 9.6 4.4-1.5 7.5-5 7.5-9.6v-6z"/><path d="m8.7 12 2.3 2.3 4.3-4.5"/>',
    crown: '<path d="M3 18h18M4 16 3 7l5 4 4-6 4 6 5-4-1 9z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="2.8"/><path d="M3 7v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8V7"/><path d="M9 16.6c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4c0-1.4-2.3-2.6-5.3-2.8"/>',
    gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3 7.5 9 12 21l4.5-12L15 3"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.9 3.3-5.8 3.8-10.3 2.6 1.6 4 3.9 4.3 6.3 1-.7 1.6-1.9 1.8-3.1 1.9 1.7 3.1 4 3.1 7.1 0 3.6-2.6 6.2-6.5 6.2z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
    slab: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 7.5h14"/><path d="M8 5h5"/><rect x="8" y="10" width="8" height="8.5" rx="1"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
    share: '<path d="M12 15V3M8 6.5 12 3l4 3.5"/><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    capsule: '<path d="M6.5 11.5V9a5.5 5.5 0 0 1 11 0v2.5M6.5 12.5V15a5.5 5.5 0 0 0 11 0v-2.5"/><path d="M5 12h14"/><path d="m12 5.6.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-1-1.7 1 .4-1.8-1.3-1.2 1.8-.2z" fill="currentColor" stroke="none"/>',
    layers: '<path d="M12 3 2 8.5l10 5.5 10-5.5z"/><path d="m2 13.5 10 5.5 10-5.5"/>',
  };
  const icon = (name, size = 20, extra = '') => `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  /** Logo : deux cartes holographiques en éventail, avec une étoile */
  const logo = (size = 30) => `<svg class="brand-logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id="holoG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".35" stop-color="#ff4fa3"/><stop offset=".7" stop-color="#7c5cff"/><stop offset="1" stop-color="#34d5ff"/></linearGradient></defs>
    <rect x="4" y="6" width="15" height="21" rx="3" transform="rotate(-14 11.5 16.5)" fill="#2a2f52" stroke="#7c5cff" stroke-width="1.5"/>
    <rect x="12" y="4" width="15" height="21" rx="3" transform="rotate(10 19.5 14.5)" fill="url(#holoG)"/>
    <path d="M19.6 9.6l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" transform="rotate(10 19.5 14.5)" fill="#fff"/>
  </svg>`;

  return { icon, logo };
})();
