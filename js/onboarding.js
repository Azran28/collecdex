/*
 * Présentation de l'appli à la première ouverture sur téléphone (v2.44, idée d'Arnaud) :
 * 5 écrans qu'on fait glisser du doigt (défilement natif « scroll-snap »), illustrations animées en CSS
 * (aucune image à télécharger : marche aussi hors ligne). Revoir : Paramètres › Application.
 */
App.onboarding = (() => {
  const KEY = 'onboarded1';
  const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } };
  const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* navigation privée */ } };
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
        <p class="ob-small">${tab('swap', 'Combat')} Et chaque heure, une <b>capsule</b> à ouvrir pour attraper des Pokémon.</p>`,
    },
  ];

  function show() {
    if (document.getElementById('ob')) return;
    const box = document.createElement('div');
    box.id = 'ob'; box.className = 'ob'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Présentation de CollecDex');
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
      next.textContent = i === slides.length - 1 ? 'C’est parti !' : 'Suivant';
      next.classList.toggle('go', i === slides.length - 1);
    };
    const go = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    track.addEventListener('scroll', () => setCur(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))), { passive: true });
    const close = () => {
      markSeen();
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

  /** Au démarrage : seulement sur téléphone, la première fois */
  function maybeShow() { if (!seen() && isPhone()) show(); }

  return { show, maybeShow, seen };
})();
