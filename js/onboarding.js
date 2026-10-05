/*
 * Présentation de l'appli à la première ouverture sur téléphone (v2.44, idée d'Arnaud) :
 * 5 écrans qu'on fait glisser du doigt (défilement natif « scroll-snap »), illustrations animées en CSS
 * (aucune image à télécharger : marche aussi hors ligne). Revoir : Paramètres › Application.
 */
App.onboarding = (() => {
  const KEY = 'onboarded1', KEY_SCAN = 'onboardedScan1';
  const seen = (k = KEY) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return true; } };
  const markSeen = (k = KEY) => { try { localStorage.setItem(k, '1'); } catch (e) { /* navigation privée */ } };
  const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

  // petite carte dessinée (bordure jaune, illustration colorée, lignes de texte)
  const card = (hue, cls = '', inner = '') => `<span class="ob-card ${cls}" style="--h:${hue}"><i class="ob-pic"></i><i class="ob-l"></i><i class="ob-l s"></i>${inner}</span>`;
  const I = (n, s = 16) => App.icons.icon(n, s);
  const tab = (icon, label) => `<span class="ob-tab">${I(icon, 14)} ${label}</span>`;

  const slides = [
    {
      cls: 'ob-s0',
      art: `<div class="ob-fan">${card(200, 'f1')}${card(30, 'f2')}${card(280, 'f3')}</div><div class="ob-logo">${App.icons.logo(56)}</div>`,
      title: 'Bienvenue dans <b class="ob-holo">CollecDex</b>',
      text: 'Ton Pokédex de cartes à collectionner : prends tes cartes en photo, suis leur valeur, complète tes séries et fais-les combattre.',
      extra: '<p class="ob-small">4 étapes rapides pour tout comprendre.</p>',
    },
    {
      cls: 'ob-s1',
      art: `<div class="ob-phone">
          <div class="ob-scene a">${card(45, 'big')}<i class="ob-ray"></i><span class="ob-found">${I('check', 13)} Reconnue !</span></div>
          <div class="ob-scene b"><div class="ob-page">${[...Array(9)].map((_, i) => card(20 + i * 37, `mini c${i}`)).join('')}</div><i class="ob-ray"></i><span class="ob-found">${I('check', 13)} 9 cartes</span></div>
        </div>
        <div class="ob-modes"><span class="m a">${I('capture', 14)} Une carte</span><span class="m b">${I('dex', 14)} Page de classeur</span></div>`,
      title: '1. Capture tes cartes',
      text: '',
      extra: `<ol class="ob-steps">
          <li><span><b>Une carte</b> ou <b>une page de classeur</b> entière (jusqu’à 18 cartes d’un coup).</span></li>
          <li><span>Prends la photo : carte <b>à plat</b>, bien <b>éclairée</b>, sans reflet.</span></li>
          <li><span>L’appli la reconnaît toute seule : <b>vérifie</b>, puis <b>enregistre</b>.</span></li>
        </ol>
        <p class="ob-small">${tab('capture', 'Capturer')} La photo prouve que tu as la carte : c’est la seule façon d’en ajouter une.</p>`,
    },
    {
      cls: 'ob-s2',
      art: `<div class="ob-total">Valeur de ta collection <b>248,60 €</b></div>
        <div class="ob-grid">${[[45, '12,50 €', '★'], [200, '0,40 €', '●'], [300, '3,20 €', '◆'], [10, '45,00 €', '★★'], [120, '0,90 €', '●'], [260, '8,70 €', '◆']]
          .map(([h, p, r], i) => card(h, `g${i}`, `<em class="ob-price">${p}</em><em class="ob-rar">${r}</em>`)).join('')}</div>`,
      title: '2. Ta collection',
      text: 'Toutes tes cartes au même endroit, avec ta photo.',
      extra: `<ul class="ob-list">
          <li>${I('coins', 15)} <span><b>Prix du marché</b> de chaque carte, mis à jour tout seul, et la valeur totale.</span></li>
          <li>${I('gem', 15)} <span><b>Rareté</b>, version (holo, reverse…), état et <b>doublons</b>.</span></li>
          <li>${I('trophy', 15)} <span>Une <b>vitrine</b> à montrer à tes amis, avec tes plus belles cartes.</span></li>
        </ul>
        <p class="ob-small">${tab('dex', 'Mon Dex')}</p>`,
    },
    {
      cls: 'ob-s3',
      art: `<div class="ob-set"><div class="ob-set-h"><b>151</b><span>138 / 207</span></div><div class="ob-bar"><i></i></div>
          <div class="ob-sgrid">${[...Array(10)].map((_, i) => [1, 4, 7].includes(i) ? `<span class="ob-card miss"><em>${String(i + 1).padStart(3, '0')}</em></span>` : card(15 + i * 33, 'mini')).join('')}</div>
          <span class="ob-goal">${I('target', 14)} Objectif : finir la série</span></div>`,
      title: '3. Complète tes séries',
      text: 'Toutes les séries Pokémon, de 1999 à aujourd’hui (d’autres licences arrivent).',
      extra: `<ul class="ob-list">
          <li>${I('check', 15)} <span>Tes cartes <b>en couleur</b>, celles qui manquent <b>en gris</b>.</span></li>
          <li>${I('search', 15)} <span><b>« Ce qu’il me manque »</b> : les cartes à trouver, les moins chères d’abord.</span></li>
          <li>${I('target', 15)} <span>Fixe-toi des <b>objectifs</b> et une liste de <b>souhaits</b>.</span></li>
        </ul>
        <p class="ob-small">${tab('explore', 'Explorer')}</p>`,
    },
    {
      cls: 'ob-s4',
      art: `<div class="ob-arena">
          <div class="ob-fighter me">${card(40, 'fc')}<span class="ob-hp"><i></i></span></div>
          <span class="ob-vs">VS</span>
          <div class="ob-fighter foe">${card(220, 'fc')}<span class="ob-hp"><i></i></span><span class="ob-dmg">−60</span></div>
        </div>`,
      title: '4. Combats',
      text: 'Tes propres cartes prennent vie !',
      extra: `<ul class="ob-list">
          <li>${I('users', 15)} <span>Forme une <b>équipe de 3 Pokémon</b> de ta collection.</span></li>
          <li>${I('bolt', 15)} <span>Leurs vraies <b>attaques et PV</b> contre l’ordinateur, 5 niveaux à battre.</span></li>
          <li>${I('box', 15)} <span>Mode <b>Avancé</b> : ajoute tes cartes Dresseur dans un sac.</span></li>
        </ul>
        ${App.play ? '' : `<p class="ob-small">${tab('swap', 'Combat')} Et chaque heure, une <b>capsule</b> à ouvrir pour attraper des Pokémon.</p>`}`,
    },
  ];

  function open(slides, key, label, last) {
    if (document.getElementById('ob')) return;
    const box = document.createElement('div');
    box.id = 'ob'; box.className = 'ob'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', label);
    box.innerHTML = `<button class="ob-skip" data-ob="skip">Passer</button>
      <div class="ob-track">${slides.map((s, i) => `<section class="ob-slide ${s.cls}" aria-label="Étape ${i + 1} sur ${slides.length}">
          <div class="ob-art">${s.art}</div>
          <div class="ob-txt"><h2>${s.title}</h2>${s.text ? `<p>${s.text}</p>` : ''}${s.extra || ''}</div>
        </section>`).join('')}</div>
      <div class="ob-foot"><div class="ob-dots">${slides.map((_, i) => `<button data-ob="dot" data-i="${i}" aria-label="Étape ${i + 1}"></button>`).join('')}</div>
        <button class="btn primary ob-next" data-ob="next">Suivant</button></div>`;
    document.body.appendChild(box);
    document.documentElement.classList.add('ob-lock');
    const track = box.querySelector('.ob-track'), next = box.querySelector('.ob-next');
    let cur = -1;
    const setCur = (i) => {
      if (i === cur) return; cur = i;
      box.querySelectorAll('.ob-dots button').forEach((d, k) => d.classList.toggle('on', k === i));
      // les animations de l'écran visible repartent du début
      box.querySelectorAll('.ob-slide').forEach((s, k) => s.classList.toggle('on', k === i));
      next.textContent = i === slides.length - 1 ? last : 'Suivant';
      next.classList.toggle('go', i === slides.length - 1);
    };
    const go = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    track.addEventListener('scroll', () => setCur(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))), { passive: true });
    const close = () => {
      markSeen(key);
      box.classList.add('out');
      document.documentElement.classList.remove('ob-lock');
      setTimeout(() => box.remove(), 260);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(Math.min(cur + 1, slides.length - 1));
      else if (e.key === 'ArrowLeft') go(Math.max(cur - 1, 0));
      else if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ob]'); if (!b) return;
      if (b.dataset.ob === 'skip') close();
      else if (b.dataset.ob === 'dot') go(+b.dataset.i);
      else if (b.dataset.ob === 'next') { if (cur >= slides.length - 1) close(); else go(cur + 1); }
    });
    setCur(0);
  }

  /* ---------- Mode d'emploi de la page Capturer (v2.46) : plus précis, à la 1re visite de la page ---------- */
  const flat = (cls = '') => `<span class="ob-back ${cls}"><i></i></span>`; // dos de carte dessiné
  const scanSlides = [
    {
      cls: 'ob-c1',
      art: `<div class="ob-phone">
          <div class="ob-scene t1">${card(45, 'big')}<i class="ob-ray"></i></div>
          <div class="ob-scene t2"><div class="ob-page">${[...Array(9)].map((_, i) => card(20 + i * 37, `mini c${i}`)).join('')}</div><i class="ob-ray"></i></div>
          <div class="ob-scene t3"><span class="ob-frame"></span>${card(300, 'big ob-slidein')}<span class="ob-plus">+1</span></div>
        </div>
        <div class="ob-modes ob-modes3"><span class="m t1">${I('capture', 14)} Une carte</span><span class="m t2">${I('dex', 14)} Classeur</span><span class="m t3">${I('rafale', 14)} Rafale</span></div>`,
      title: 'Capturer : 3 façons',
      extra: `<ul class="ob-list">
          <li>${I('capture', 15)} <span><b>Une carte</b> : la plus fiable. Pour une carte précieuse, ou pour la faire <b>certifier</b>.</span></li>
          <li>${I('dex', 15)} <span><b>Classeur</b> : une page entière (9 ou 4 cartes), ou le classeur ouvert (18 cartes). Les cases sont trouvées toutes seules.</span></li>
          <li>${I('rafale', 15)} <span><b>Rafale</b> : présente tes cartes l’une après l’autre devant la caméra ; chacune est prise dès qu’elle ne bouge plus.</span></li>
        </ul>`,
    },
    {
      cls: 'ob-c2',
      art: `<div class="ob-sel"><span class="ob-sel-a">Série : je ne sais pas ▾</span><span class="ob-sel-b">${I('check', 14)} 151 (2023) ▾</span></div>
        <div class="ob-sgrid ob-hint">${[...Array(5)].map((_, i) => card(15 + i * 40, 'mini')).join('')}</div>`,
      title: 'Choisis la série (si tu la connais)',
      text: 'C’est facultatif, mais <b>beaucoup plus fiable</b> et plus rapide.',
      extra: `<ul class="ob-list">
          <li>${I('layers', 15)} <span>Toutes tes cartes viennent de la même série ? Choisis-la dans le menu <b>au-dessus de la photo</b> : il devient vert.</span></li>
          <li>${I('search', 15)} <span>Tu ne sais pas, ou elles sont mélangées ? Laisse « je ne sais pas » : l’appli cherche partout, et <b>devine</b> la série d’une page toute seule.</span></li>
          <li>${I('clock', 15)} <span>La série choisie est gardée pour les photos suivantes.</span></li>
        </ul>`,
    },
    {
      cls: 'ob-c3',
      art: `<div class="ob-vs2">
          <div class="ob-ex ok">${card(45, 'big')}<span class="ob-mark">${I('check', 16)}</span><b>Comme ça</b></div>
          <div class="ob-ex ko">${card(45, 'big ob-glare')}<span class="ob-mark">✕</span><b>Pas comme ça</b></div>
        </div>`,
      title: 'Une bonne photo',
      text: 'L’appli lit surtout le <b>numéro en bas</b> de la carte (ex. 025/165) et son nom.',
      extra: `<ul class="ob-list">
          <li>${I('check', 15)} <span>Carte <b>à plat</b>, prise <b>bien de face</b>, qui remplit le cadre jaune.</span></li>
          <li>${I('sparkles', 15)} <span>Bonne <b>lumière</b>, mais <b>pas de reflet</b> sur le numéro (penche un peu la carte si besoin).</span></li>
          <li>${I('dex', 15)} <span>Classeur : <b>toute la page</b> dans la photo, sans flou. L’appareil photo du téléphone est le plus net.</span></li>
        </ul>`,
    },
    {
      cls: 'ob-c4',
      art: `<div class="ob-page big">${['ok', 'ok', 'doubt', 'ok', 'empty', 'ok', 'ok', 'doubt', 'ok'].map((s, i) => s === 'empty' ? `<span class="ob-card mini ob-cell empty"></span>` : card(20 + i * 37, `mini ob-cell ${s} d${i}`, s === 'doubt' ? '<em class="ob-q">?</em>' : '')).join('')}</div>
        <div class="ob-legend"><span class="ok">Reconnue</span><span class="doubt">À vérifier</span><span class="empty">Vide / dos</span></div>`,
      title: 'L’appli reconnaît tes cartes',
      extra: `<ol class="ob-steps">
          <li><span>Elle lit le numéro et le nom, puis <b>compare ta photo aux visuels officiels</b>. La 1ʳᵉ fois, elle télécharge ses outils (Wi‑Fi conseillé).</span></li>
          <li><span>Elle te montre ensuite <b>seulement les cartes douteuses</b>, en orange.</span></li>
          <li><span>Pour chacune : <b>« C’est elle »</b>, touche une autre proposition, ou <b>« Chercher »</b> par nom ou numéro.</span></li>
        </ol>`,
    },
    {
      cls: 'ob-c5',
      art: `<div class="ob-recap">${[[45, 'Nouvelle', 'Normale'], [200, 'Doublon', 'Holo'], [300, 'Nouvelle', 'Reverse ?']].map(([h, st, v], i) => `<div class="ob-rc">${card(h, 'mid')}<em class="ob-vp ${v.includes('?') ? 'doubt' : ''}">${v}</em><span class="ob-st ${st === 'Doublon' ? 'dup' : ''}">${st}</span></div>`).join('')}</div>
        <span class="ob-save">${I('check', 15)} Enregistrer 3 cartes</span>`,
      title: 'Vérifie et enregistre',
      extra: `<ul class="ob-list">
          <li>${I('dex', 15)} <span>Le <b>récapitulatif</b> montre chaque carte : <b>Nouvelle</b>, ou <b>Doublon</b> si tu l’as déjà (compté comme exemplaire en plus).</span></li>
          <li>${I('gem', 15)} <span>Touche l’étiquette de <b>version</b> (Normale, Holo, Reverse) pour la changer ; en orange avec « ? » quand l’appli n’est pas sûre.</span></li>
          <li>${I('check', 15)} <span><b>Enregistrer</b> : c’est fait ! Ta photo devient le visuel de la carte dans ton Dex.</span></li>
        </ul>`,
    },
    {
      cls: 'ob-c6',
      art: `<div class="ob-flip"><div class="ob-flip-in">${flat('face-b')}${card(45, 'big face-f')}</div><span class="ob-shield">${I('shield', 16)} Certifiée</span></div>`,
      title: 'Bonus : le badge « Certifiée »',
      text: 'Il prouve que tu as <b>vraiment</b> la carte en main. Il faut être connecté.',
      extra: `<ol class="ob-steps">
          <li><span>En <b>Une carte</b>, touche <b>« Caméra »</b> et montre d’abord le <b>dos</b> de la carte (sur Android, la lampe clignote : garde le dos immobile jusqu’à la fin). La certification peut se désactiver dans l’encadré « Certifier la carte ».</span></li>
          <li><span><b>Retourne-la</b> : le bouton devient vert ${I('shield', 13)}.</span></li>
          <li><span>Prends la photo dans les 15 secondes : la carte est certifiée.</span></li>
        </ol>
        <p class="ob-small">Les photos choisies dans la galerie sont ajoutées sans badge. Revoir ce mode d’emploi : bouton <b>?</b> en haut de Capturer.</p>`,
    },
  ];

  const show = () => open(slides, KEY, 'Présentation de CollecDex', 'C’est parti !');
  const showScan = () => open(scanSlides, KEY_SCAN, 'Mode d’emploi de Capturer', 'À moi de jouer !');

  /** Au démarrage : seulement sur téléphone, la première fois */
  // pas par-dessus une vitrine publique ouverte depuis un lien partagé (#/@Pseudo) : ce sera pour la visite suivante
  function maybeShow() { if (!seen() && isPhone() && !/^#\/@/.test(location.hash)) show(); }
  /** 1re visite de Capturer sur téléphone (pas par-dessus la présentation générale : ce sera pour la visite suivante) */
  function maybeShowScan() { if (!seen(KEY_SCAN) && isPhone() && !document.getElementById('ob')) showScan(); }

  return { show, showScan, maybeShow, maybeShowScan, seen };
})();
