/*
 * Raretés Pokémon : ordre (de la plus commune à la plus rare), noms français et symboles.
 * Les noms français viennent des traductions officielles de TCGdex.
 */
App.pokemonRarity = (() => {
  // clé canonique (anglais TCGdex) → [rang, nom FR, symbole]
  // symbole : { s: forme, n: nombre, c: couleur, t: texte optionnel }
  const INK = '#dfe4ee', SILVER = '#aab6c8', GOLD = '#e8b923', PINK = '#ff5fa2', RAINBOW = 'url(#rbw)';
  const R = {
    'None':                      [0,  'Sans rareté',                { s: 'txt', t: '—' }],
    'Common':                    [1,  'Commune',                    { s: 'circle', n: 1, c: INK }],
    'One Diamond':               [1,  'Un Diamant',                 { s: 'diamond', n: 1, c: INK }],
    'Uncommon':                  [2,  'Peu commune',                { s: 'diamond', n: 1, c: INK }],
    'Two Diamond':               [2,  'Deux Diamants',              { s: 'diamond', n: 2, c: INK }],
    'Rare':                      [3,  'Rare',                       { s: 'star', n: 1, c: INK }],
    'Three Diamond':             [3,  'Trois Diamants',             { s: 'diamond', n: 3, c: INK }],
    'Promo':                     [3,  'Promo',                      { s: 'txt', t: 'PROMO' }],
    'Rare Holo':                 [4,  'Rare Holo',                  { s: 'star', n: 1, c: SILVER, t: 'H' }],
    'Holo Rare':                 [4,  'Holo Rare',                  { s: 'star', n: 1, c: SILVER, t: 'H' }],
    'Four Diamond':              [4,  'Quatre Diamants',            { s: 'diamond', n: 4, c: INK }],
    'Classic Collection':        [5,  'Collection Classique',       { s: 'txt', t: 'CLASSIC' }],
    'Rare Holo LV.X':            [5,  'Rare Holo LV.X',             { s: 'star', n: 1, c: SILVER, t: 'LV.X' }],
    'Rare PRIME':                [5,  'Rare Prime',                 { s: 'star', n: 1, c: SILVER, t: 'PRIME' }],
    'LEGEND':                    [6,  'LÉGENDE',                    { s: 'star', n: 1, c: GOLD, t: 'LEGEND' }],
    'Double rare':               [6,  'Double rare',                { s: 'star', n: 2, c: INK }],
    'Holo Rare V':               [6,  'Holo Rare V',                { s: 'star', n: 1, c: SILVER, t: 'V' }],
    'ACE SPEC Rare':             [6,  'HIGH-TECH rare',             { s: 'txt', t: 'ACE SPEC', c: PINK }],
    'One Star':                  [6,  'Une Étoile',                 { s: 'star', n: 1, c: GOLD }],
    'Holo Rare VMAX':            [7,  'Holo Rare VMAX',             { s: 'star', n: 1, c: SILVER, t: 'VMAX' }],
    'Holo Rare VSTAR':           [7,  'Holo Rare VSTAR',            { s: 'star', n: 1, c: SILVER, t: 'VSTAR' }],
    'Radiant Rare':              [7,  'Radieux Rare',               { s: 'sparkle', n: 1, c: GOLD, t: 'RADIANT' }],
    'Amazing Rare':              [7,  'Magnifique',                 { s: 'sparkle', n: 1, c: RAINBOW }],
    'One Shiny':                 [7,  'Un Chromatique',             { s: 'sparkle', n: 1, c: GOLD }],
    'Ultra Rare':                [8,  'Ultra Rare',                 { s: 'star', n: 2, c: SILVER }],
    'Full Art Trainer':          [8,  'Dresseur Full Art',          { s: 'star', n: 2, c: SILVER, t: 'FA' }],
    'Shiny rare':                [8,  'Shiny rare',                 { s: 'sparkle', n: 1, c: GOLD }],
    'Two Star':                  [8,  'Deux Étoiles',               { s: 'star', n: 2, c: GOLD }],
    'Two Shiny':                 [8,  'Deux Chromatiques',          { s: 'sparkle', n: 2, c: GOLD }],
    'Illustration rare':         [9,  'Illustration rare',          { s: 'star', n: 1, c: GOLD }],
    'Shiny rare V':              [9,  'Shiny rare V',               { s: 'sparkle', n: 1, c: GOLD, t: 'V' }],
    'Shiny rare VMAX':           [9,  'Shiny rare VMAX',            { s: 'sparkle', n: 1, c: GOLD, t: 'VMAX' }],
    'Three Star':                [9,  'Trois Étoiles',              { s: 'star', n: 3, c: GOLD }],
    'Shiny Ultra Rare':          [10, 'Chromatique ultra rare',     { s: 'sparkle', n: 2, c: GOLD }],
    'Black White Rare':          [10, 'Rare Noir Blanc',            { s: 'txt', t: 'BW', c: '#111' }],
    'Special illustration rare': [11, 'Illustration spéciale rare', { s: 'star', n: 2, c: GOLD }],
    'Mega Attack Rare':          [11, 'Mega Attack Rare',           { s: 'star', n: 2, c: GOLD, t: 'M' }],
    'Secret Rare':               [12, 'Magnifique rare',            { s: 'star', n: 1, c: RAINBOW, t: 'S' }],
    'Hyper rare':                [12, 'Hyper rare',                 { s: 'star', n: 3, c: GOLD }],
    'Crown':                     [13, 'Couronne',                   { s: 'crown', n: 1, c: GOLD }],
    'Mega Hyper Rare':           [13, 'Méga Hyper Rare',            { s: 'star', n: 3, c: RAINBOW, t: 'M' }],
  };

  // Table inverse : nom affiché (FR ou EN, insensible à la casse) → clé canonique
  const lookup = {};
  for (const [key, v] of Object.entries(R)) {
    lookup[key.toLowerCase()] = key;
    lookup[v[1].toLowerCase()] = key;
  }
  // variantes d'écriture vues dans l'API
  Object.assign(lookup, { 'peu commune': 'Uncommon', 'commune': 'Common', 'sans rareté': 'None', 'magnifique rare': 'Secret Rare', 'high-tech rare': 'ACE SPEC Rare' });

  const key = (r) => lookup[String(r || 'None').toLowerCase()] || null;
  const rank = (r) => { const k = key(r); return k ? R[k][0] : 5; };
  const label = (r) => { const k = key(r); return k ? R[k][1] : (r || 'Inconnue'); };

  const shapes = {
    circle: (c) => `<circle cx="8" cy="8" r="5.2" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width="1"/>`,
    diamond: (c) => `<path d="M8 1.8 14.2 8 8 14.2 1.8 8Z" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width="1"/>`,
    star: (c) => `<path d="M8 1 10.1 5.6 15 6.1 11.3 9.4 12.4 14.3 8 11.8 3.6 14.3 4.7 9.4 1 6.1 5.9 5.6Z" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width=".9"/>`,
    sparkle: (c) => `<path d="M8 .8 9.6 6.4 15.2 8 9.6 9.6 8 15.2 6.4 9.6.8 8 6.4 6.4Z" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width=".8"/>`,
    crown: (c) => `<path d="M1.5 12.5 2.5 4.5 5.5 8 8 2.5 10.5 8 13.5 4.5 14.5 12.5Z" fill="${c}" stroke="#000" stroke-opacity=".5" stroke-width=".9"/>`,
  };
  // Couleur selon le niveau de rareté : du gris (commune) à l'or rosé puis l'arc-en-ciel (les plus rares)
  const GOLDPINK = 'url(#gpk)';
  const TIER = ['#8a92a8', '#b9c0d4', '#3ddc97', '#4da3ff', '#36d6e7', '#2ee6c5', '#a78bfa', '#c77dff', '#ff6ec7', '#ffc53d', '#ff9f43', GOLDPINK, RAINBOW, RAINBOW];
  const colorOf = (k) => (R[k][2].c === RAINBOW ? RAINBOW : TIER[R[k][0]] || '#b9c0d4');
  const pillBg = (c) => (c === RAINBOW ? 'linear-gradient(90deg,#ff6ec4,#7873f5,#4ade80,#facc15)' : c === GOLDPINK ? 'linear-gradient(90deg,#ffc53d,#ff6ec7)' : c);
  const defs = '<defs><linearGradient id="gpk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient><linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6ec4"/><stop offset=".35" stop-color="#7873f5"/><stop offset=".7" stop-color="#4ade80"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs>';

  /** Renvoie le HTML du symbole de rareté */
  const symbol = (r, size = 15) => {
    const k = key(r);
    const lab = App.util.esc(label(r));
    if (!k) return `<span class="rar" title="${lab}"><span class="rar-txt">${App.util.esc(String(r || '?').slice(0, 10))}</span></span>`;
    const sym = R[k][2], col = colorOf(k);
    if (sym.s === 'txt') return `<span class="rar" title="${lab}"><span class="rar-txt" style="background:${pillBg(sym.c || col)}">${App.util.esc(sym.t)}</span></span>`;
    const one = `<svg width="${size}" height="${size}" viewBox="0 0 16 16">${col.startsWith('url') ? defs : ''}${shapes[sym.s](col)}</svg>`;
    return `<span class="rar" title="${lab}">${one.repeat(sym.n || 1)}${sym.t ? `<span class="rar-txt" style="margin-left:3px;background:${pillBg(col)}">${App.util.esc(sym.t)}</span>` : ''}</span>`;
  };

  /** Couleur CSS de la rareté (pour les barres de progression, pastilles…) */
  const css = (r) => { const k = key(r); return k ? pillBg(colorOf(k)) : '#b9c0d4'; };

  return { key, rank, label, symbol, css };
})();
