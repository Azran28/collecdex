/* Vitrine : ton profil de collectionneur, personnalisable (thème, cadres, mise en page, cartes à l'honneur) */
App.views.showcase = {
  THEMES: [['nuit', 'Nuit étoilée'], ['holo', 'Holographique'], ['feu', 'Braise'], ['foret', 'Forêt'], ['classeur', 'Classeur'], ['pokeball', 'Poké Ball']],
  FRAMES: [['aucun', 'Aucun'], ['or', 'Or'], ['argent', 'Argent'], ['holo', 'Holo'], ['neon', 'Néon'], ['bois', 'Bois'], ['vitre', 'Vitrine']],
  LAYOUTS: [['vedette', 'Vedette + grille'], ['grille', 'Grille'], ['classeur', 'Page de classeur (3×3)'], ['eventail', 'Éventail']],

  async render(el, params, alive) {
    const { esc, euro } = App.util;
    const V = App.views.showcase;
    // Vitrine d'un ami (lecture seule) ou la tienne
    // Vitrine publique (#/@Pseudo, visible par tout le monde, même sans compte)
    const pubName = params.pub ? String(params.pub).slice(0, 40) : null;
    let friendId = params.friend || null;
    let S; // source des données affichées
    if (friendId || pubName) {
      el.innerHTML = App.ui.loading(pubName ? 'Chargement de la vitrine…' : 'Chargement de sa vitrine…');
      let d;
      try {
        d = pubName ? await App.friends.publicShowcase(pubName) : await App.friends.showcase(friendId);
        if (pubName) friendId = d.user_id;
      } catch (e) {
        el.innerHTML = pubName
          ? `<div class="breadcrumb"><a href="#/">Accueil</a></div><div class="panel v-pub-miss"><h2 style="margin-top:0">Vitrine introuvable</h2><p>${esc(e.message)}</p><a class="btn primary" href="#/">Découvrir CollecDex</a></div>`
          : `<div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/amis">Mes amis</a></div><div class="panel">${App.cloud.user ? esc(e.message) : `Connecte-toi pour voir la vitrine de tes amis.<div style="margin-top:10px"><a class="btn primary" href="#/connexion">Me connecter</a></div>`}</div>`;
        return;
      }
      if (!alive()) return;
      const items = (d.items || []).filter((i) => i && i.qty > 0);
      const byKey = new Map(items.map((i) => [i.key, i]));
      const certs = new Map((d.certs || []).map((c) => [c.photo_id, c.key]));
      const prof = Object.assign({ pseudo: 'Dresseur', bio: '', theme: 'nuit', frame: 'or', layout: 'vedette', featured: [], frames: {}, showStats: true, showBadges: true, showTop: true }, d.profile || {});
      if (d.pseudo) prof.pseudo = d.pseudo;
      const photo = (id) => (pubName ? App.cloud.fetchPublicPhoto(friendId, id) : App.cloud.fetchFriendPhoto(friendId, id));
      S = {
        friend: true, pub: !!pubName, uid: friendId, profile: prof, items: () => items, byKey: (k) => byKey.get(k),
        owns: (game, id) => items.some((i) => i.game === game && i.id === id),
        cert: (it) => (it.photos || []).some((p) => certs.get(p) === it.key),
        img: async (it, ad, q = 'low') => {
          if (it.displayPhoto && (!pubName || d.photos)) { const u = await photo(it.displayPhoto); if (u) return { src: u, mine: true }; }
          return { src: ad.img.card({ image: it.snap.image, id: it.id, setId: it.setId, localId: it.snap.localId, serieId: it.snap.serieId, lang: it.lang || 'fr' }, q), mine: false };
        },
        avatar: async (p) => (p.avatarPoke && p.avatarPoke.id ? App.pokedex.img(p.avatarPoke.id, !!p.avatarPoke.shiny) : p.avatar && (!pubName || d.photos) ? photo(p.avatar) : ''),
      };
    } else {
      S = {
        friend: false, profile: await App.col.getProfile(), items: () => App.col.all().filter((i) => i.qty > 0), byKey: (k) => App.col.byKey(k),
        owns: (game, id) => App.col.owned(game, id), cert: (it) => App.certify.isCertified(it),
        img: (it, ad, q) => App.col.displayImage(it, ad, q), avatar: (p) => App.capsules.avatarURL(p),
      };
    }
    let profile = S.profile;
    let editing = !S.friend && !!params.query.edit;

    const owned = () => S.items();
    const val = (i) => App.col.valueOf(i);
    const featuredItems = () => {
      const list = profile.featured.map((k) => S.byKey(k)).filter((i) => i && i.qty > 0);
      if (list.length) return { list, auto: false };
      const favs = owned().filter((i) => i.favorite);
      const auto = (favs.length ? favs : owned()).sort((a, b) => val(b) - val(a)).slice(0, profile.layout === 'classeur' ? 9 : 7);
      return { list: auto, auto: true };
    };

    let completedSets = [];
    const loadBadges = async () => {
      try {
        const ad = App.games.get('pokemon');
        const sets = await ad.listSets();
        const its = S.friend ? owned() : null;
        completedSets = sets.filter((s) => (its ? its.some((i) => i.setId === s.id) : App.col.inSet('pokemon', s.id).length) && App.col.progress('pokemon', s, its).complete);
      } catch (e) { completedSets = []; }
    };

    const vcard = async (it, i, n) => {
      const ad = App.games.get(it.game);
      const img = await S.img(it, ad, 'high');
      const frame = profile.frames[it.key] || profile.frame;
      // éventail : l'angle se resserre quand il y a beaucoup de cartes (tout doit tenir dans la vitrine)
      const d = i - (n - 1) / 2, step = n > 1 ? Math.min(7, 32 / (n - 1)) : 0;
      const fan = profile.layout === 'eventail' ? `style="--rot:${(d * step).toFixed(2)}deg; --dy:${(Math.abs(d) * step * 0.9).toFixed(1)}px; z-index:${n - Math.abs(Math.round(d))}"` : '';
      return `<div class="vcard" data-card="${esc(it.id)}" data-game="${esc(it.game)}" ${fan}>
        ${S.cert(it) ? `<span class="v-certmark" title="Certifiée : capturée en direct">${App.icons.icon('shield', 14)}</span>` : ''}
        <div class="frame-${esc(frame)}"><img src="${esc(img.src)}" alt="${esc(it.snap.name)}" data-alt="${esc(it.snap.name)}"></div>
        ${profile.layout !== 'eventail' ? `<div class="vlabel">${esc(it.snap.name)}${val(it) ? ` · <span style="color:var(--accent2)">${euro(val(it))}</span>` : ''}${it.cond && it.cond.kind === 'graded' ? ` <span class="condchip inline">${esc(App.col.condLabel(it.cond))}</span>` : ''}</div>` : ''}
      </div>`;
    };

    const draw = async () => {
      const items = owned();
      const total = App.col.totalValue(items);
      const { list: feat, auto } = featuredItems();
      const top = [...items].sort((a, b) => val(b) - val(a)).slice(0, 10);
      const fresh = S.friend ? new Set() : new Set((await App.badges.check({ silent: true })).map((b) => b.id));
      const got = S.friend ? await App.badges.unlocked(owned(), S.cert) : await App.badges.unlocked();
      const wl = (profile.wishlist || []).filter((w) => !S.owns(w.game, w.id));
      const avatar = await S.avatar(profile);
      const featHTML = (await Promise.all(feat.map((it, i) => vcard(it, i, feat.length)))).join('');
      const topHTML = (await Promise.all(top.map(async (it) => {
        const img = await S.img(it, App.games.get(it.game));
        return `<div class="vcard" data-card="${esc(it.id)}" data-game="${esc(it.game)}"><div class="frame-aucun"><img src="${esc(img.src)}" alt="" data-alt="${esc(it.snap.name)}"></div><div class="vlabel">${esc(it.snap.name)}<br><span style="color:var(--accent2)">${val(it) ? euro(val(it)) : '—'}</span></div></div>`;
      }))).join('');
      // cartes certifiées mises en avant (les plus précieuses d'abord)
      const certItems = profile.showCerts !== false ? items.filter((i) => S.cert(i)).sort((a, b) => val(b) - val(a)) : [];
      const certHTML = (await Promise.all(certItems.slice(0, 18).map(async (it) => {
        const img = await S.img(it, App.games.get(it.game));
        return `<div class="vcard" data-card="${esc(it.id)}" data-game="${esc(it.game)}"><span class="v-certmark">${App.icons.icon('shield', 14)}</span><div class="frame-aucun"><img src="${esc(img.src)}" alt="" loading="lazy" data-alt="${esc(it.snap.name)}"></div><div class="vlabel">${esc(it.snap.name)}</div></div>`;
      }))).join('');
      if (!alive()) return;
      const isMe = S.pub && App.cloud.user && App.cloud.user.id === S.uid;

      el.innerHTML = `
        ${S.pub ? `<div class="breadcrumb"><a href="#/">Accueil</a> › Vitrine de ${esc(profile.pseudo)}</div>
        <div class="row v-top" style="margin-bottom:14px"><h1>Vitrine de ${esc(profile.pseudo)}</h1><span class="spacer"></span>
          <button class="btn ghost" id="v-share" title="Partager cette vitrine">${App.icons.icon('share', 16)}<span class="m-hide"> Partager</span></button>
          ${isMe ? `<a class="btn" href="#/compte?edit=1">✎ Personnaliser</a>` : App.cloud.user ? `<a class="btn primary" href="#/amis?ajout=${encodeURIComponent(profile.pseudo)}">${App.icons.icon('users', 16)} Ajouter en ami</a>` : ''}</div>`
        : S.friend ? `<div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/amis">Mes amis</a> › ${esc(profile.pseudo)}</div>
        <div class="row v-top" style="margin-bottom:14px"><h1>Vitrine de ${esc(profile.pseudo)}</h1><span class="spacer"></span>
          <a class="btn ghost" href="#/amis">${App.icons.icon('users', 16)}<span class="m-hide"> Mes amis</span></a></div>` : `
        <div class="row v-top" style="margin-bottom:14px"><h1>Ma vitrine</h1><span class="spacer"></span>
          ${profile.public && App.cloud.user ? `<button class="btn ghost" id="v-share" title="Partager ma vitrine publique">${App.icons.icon('share', 16)}<span class="m-hide"> Partager</span></button>` : ''}
          <a class="btn ${App.friends.pendingIn() ? 'primary' : 'ghost'} v-friends" href="#/amis" title="Mes amis">${App.icons.icon('users', 16)}<span class="m-hide"> Amis</span>${App.friends.pendingIn() ? `<span class="fr-count">${App.friends.pendingIn()}</span>` : ''}</a>
          <a class="btn ghost" href="#/parametres" title="Compte, synchronisation et paramètres">${App.icons.icon('gear', 16)}<span class="m-hide"> Compte et réglages</span></a>
          <button class="btn ${editing ? 'primary' : ''}" id="v-edit">${editing ? '✓ Terminer' : '✎ Personnaliser'}</button></div>`}
        <section class="vitrine theme-${esc(profile.theme)}" id="v-page">
          <div class="v-head">
            <div class="v-avatar" style="${avatar ? `background-image:url('${esc(avatar)}')` : ''}">${avatar ? '' : esc((profile.pseudo || '?')[0].toUpperCase())}</div>
            <div style="flex:1;min-width:220px">
              <div class="v-name">${esc(profile.pseudo)}</div>
              ${profile.bio ? `<div class="muted" style="white-space:pre-line">${esc(profile.bio)}</div>` : ''}
            </div>
          </div>
          ${profile.showStats ? `<div class="stats">
            <div class="stat"><b>${items.length}</b><span>cartes</span></div>
            <div class="stat"><b>${euro(total)}</b><span>valeur estimée</span></div>
            <div class="stat"><b>${completedSets.length}</b><span>séries complétées</span></div>
            <div class="stat"><b>${items.filter((i) => S.cert(i)).length}</b><span>certifiées</span></div>
          </div>` : ''}
          ${feat.length ? `<div class="v-featured layout-${esc(profile.layout)}" style="--n:${feat.length}">${featHTML}</div>
            ${editing || S.friend ? '' : `<p class="small muted v-pick-link">${auto ? 'Sélection automatique (favorites ou plus chères). ' : ''}<a href="#" id="v-pickcards2">${App.icons.icon('star', 13)} Choisir mes cartes à l’honneur</a></p>`}`
            : `<div class="empty">${S.friend ? 'Pas encore de cartes dans sa collection.' : 'Ajoute des cartes à ta collection pour remplir ta vitrine.'}</div>`}
          ${certItems.length ? `<div class="v-certs">
            <div class="row" style="margin:26px 0 4px"><h2 style="margin:0">${App.icons.icon('shield', 18)} Cartes certifiées</h2><span class="muted small">${certItems.length}</span></div>
            <p class="small muted" style="margin:0 0 10px">Photographiées en direct dans l’appli et vérifiées par le serveur : ${S.friend ? 'ce dresseur possède' : 'tu possèdes'} vraiment ces cartes.</p>
            <div class="v-wish-grid">${certHTML}</div>
          </div>` : ''}
          ${profile.showBadges ? `<div class="v-achievements">
            <div class="row" style="margin-bottom:8px"><h2 style="margin:0">Badges</h2><span class="muted small">${got.length} / ${App.badges.total}</span><span class="spacer"></span>
              ${App.badges.total > got.length ? `<span class="small muted">${App.icons.icon('lock', 13)} ${App.badges.total - got.length} badge${App.badges.total - got.length > 1 ? 's' : ''} secret${App.badges.total - got.length > 1 ? 's' : ''} à débloquer</span>` : ''}</div>
            ${got.length ? `<div class="badge-grid">${[...got].sort((a, b) => b.tier - a.tier).map((b) => App.badges.medal(b, { isNew: fresh.has(b.id) })).join('')}</div>` : '<div class="muted small">Aucun badge pour l’instant : ils se débloquent en complétant ta collection.</div>'}
          </div>` : ''}
          ${profile.showBadges && completedSets.length ? `<div class="v-badges">${completedSets.map((s) => `<span class="v-badge" title="Série complétée">${s.symbol ? `<img src="${esc(s.symbol)}.png" alt="">` : App.icons.icon('trophy', 14)}${esc(s.name)}</span>`).join('')}</div>` : ''}
          ${profile.showWish !== false && wl.length ? `<div class="v-wish">
            <div class="row" style="margin:26px 0 10px"><h2 style="margin:0">${App.icons.icon('heart', 18)} ${S.friend ? 'Recherche' : 'Je recherche'}</h2><span class="muted small">${wl.length} carte${wl.length > 1 ? 's' : ''}${S.friend && wl.some((w) => App.col.owned(w.game, w.id)) ? ` · <b style="color:var(--ok)">tu en as ${wl.filter((w) => App.col.owned(w.game, w.id)).length}</b>` : ''}</span><span class="spacer"></span>${S.friend ? '' : '<a class="small" href="#/objectifs?tab=souhaits">Gérer ›</a>'}</div>
            <div class="v-wish-grid">${wl.slice(0, 12).map((w) => `<div class="vcard" data-card="${esc(w.id)}" data-game="${esc(w.game)}"><div class="frame-aucun"><img src="${esc(App.games.get(w.game).img.card({ image: w.image, id: w.id, setId: w.setId, localId: w.localId, serieId: w.serieId }, 'low'))}" alt="" loading="lazy" data-alt="${esc(w.name)}"></div><div class="vlabel">${esc(w.name)}<br><span class="muted" style="font-weight:500">${esc(w.setName || '')}</span>${S.friend && App.col.owned(w.game, w.id) ? '<br><span class="v-ihave">✓ Tu l’as</span>' : ''}</div></div>`).join('')}${wl.length > 12 ? `<a class="v-wish-more" href="#/objectifs?tab=souhaits">+${wl.length - 12}</a>` : ''}</div>
          </div>` : ''}
          ${profile.showTop && top.length ? `<h2 style="margin-top:26px">Les ${top.length} plus précieuses</h2><div class="v-featured layout-grille" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${topHTML}</div>` : ''}
        </section>
        ${S.pub && !isMe && !App.col.all().length ? `<div class="panel v-pub-cta"><b>Toi aussi, collectionnes-tu des cartes ?</b>
          <p class="small muted" style="margin:6px 0 10px">Avec CollecDex, prends tes cartes en photo : l’appli les reconnaît, suit ta progression par série et crée ta propre vitrine. Gratuit.</p>
          <a class="btn primary" href="#/">Découvrir CollecDex</a></div>` : ''}
        <section class="panel edit-panel" id="v-editor" ${editing ? '' : 'hidden'}></section>`;

      if (editing) await drawEditor();
    };

    const drawEditor = async () => {
      const box = el.querySelector('#v-editor');
      const items = owned().sort((a, b) => val(b) - val(a));
      const imgs = await Promise.all(items.map((it) => App.col.displayImage(it, App.games.get(it.game))));
      const myPseudo = App.cloud.user ? await App.cloud.myPseudo().catch(() => null) : null;
      const link = myPseudo ? App.friends.publicLink(myPseudo) : '';
      const fp = (list, cur, attr, swatch) => `<div class="frame-picker">${list.map(([k, l]) => `<div class="fp ${k === cur ? 'on' : ''}" data-${attr}="${k}">${swatch(k)}${l}</div>`).join('')}</div>`;
      box.innerHTML = `
        <h2>Personnaliser ma vitrine</h2>
        <div class="v-pubbox ${profile.public && myPseudo ? 'on' : ''}">
          <h3 style="margin-top:0">${App.icons.icon('globe', 16)} Vitrine publique</h3>
          ${!App.cloud.user ? `<p class="small muted" style="margin:0"><a href="#/connexion">Connecte-toi</a> et réserve ton pseudo pour partager ta vitrine avec un simple lien.</p>`
          : !myPseudo ? `<p class="small muted" style="margin:0">Réserve d’abord ton pseudo (plus bas, dans « Profil ») : il sert d’adresse à ta vitrine.</p>`
          : `<label class="check"><input type="checkbox" id="e-public" ${profile.public ? 'checked' : ''}> Tout le monde peut voir ma vitrine avec le lien (même sans compte)</label>
            ${profile.public ? `<div style="margin-top:6px"><label class="check"><input type="checkbox" id="e-pubphotos" ${profile.publicPhotos !== false ? 'checked' : ''}> Montrer mes photos des cartes (sinon : visuels officiels)</label></div>
            <div class="fr-link" style="margin-top:10px"><input type="text" readonly value="${esc(link)}" id="e-publink"><button class="btn primary" id="e-share">${navigator.share ? 'Partager' : 'Copier'}</button></div>
            <p class="small muted" style="margin:6px 0 0">Visible : tes cartes, badges, statistiques et ce que tu choisis d’afficher ci-dessous. Jamais tes notes ni tes objectifs. <a href="#/@${esc(encodeURIComponent(myPseudo))}">Voir comme un visiteur ›</a></p>`
            : `<p class="small muted" style="margin:6px 0 0">Pour l’instant, seuls tes amis voient ta vitrine.</p>`}`}
        </div>
        <h3 id="e-picker">Cartes à l’honneur <span class="muted small">(${profile.featured.length}/9 — clique pour ajouter ou retirer, dans l’ordre voulu)</span></h3>
        ${items.length ? `<div class="row" style="margin-bottom:8px"><input type="search" id="e-pick-q" placeholder="Chercher une carte…" style="flex:1;min-width:0">${profile.featured.length ? '<button class="btn sm ghost" id="e-pick-clear">Tout retirer</button>' : ''}</div>
          <div class="pick-list">${items.map((it, i) => {
          const n = profile.featured.indexOf(it.key);
          return `<div class="pk ${n >= 0 ? 'on' : ''}" data-pick="${esc(it.key)}" data-q="${esc(App.util.norm(it.snap.name + ' ' + (it.snap.setName || '')))}" title="${esc(it.snap.name)}">${n >= 0 ? `<span class="n">${n + 1}</span>` : ''}<img src="${esc(imgs[i].src)}" alt="" loading="lazy" data-alt="${esc(it.snap.name)}"></div>`;
        }).join('')}</div>` : '<div class="muted">Aucune carte dans ta collection pour l’instant.</div>'}
        ${profile.featured.length ? `<h3 style="margin-top:18px">Cadre par carte</h3><div class="row">${profile.featured.map((k) => { const it = App.col.byKey(k); if (!it) return ''; return `<label class="pill">${esc(it.snap.name)} <select data-cframe="${esc(k)}"><option value="">(cadre par défaut)</option>${V.FRAMES.map(([f, l]) => `<option value="${f}" ${profile.frames[k] === f ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }).join('')}</div>` : ''}
        <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:22px">
          <div>
            <h3>Profil</h3>
            <div class="row" style="gap:6px;flex-wrap:nowrap"><input type="text" id="e-pseudo" value="${esc(profile.pseudo)}" placeholder="Pseudo" maxlength="20" style="flex:1;min-width:0"><button class="btn sm primary" id="e-pseudo-ok">Valider</button></div>
            <div class="small muted" id="e-pseudo-msg" style="margin:4px 0 10px">${App.cloud.user ? 'Chaque pseudo est unique : 3 à 20 caractères.' : 'Connecte-toi pour réserver ton pseudo (il est unique).'}</div>
            <p><textarea id="e-bio" placeholder="Quelques mots sur ta collection…">${esc(profile.bio)}</textarea></p>
            <div class="row"><button class="btn sm" id="e-avatar-pick">${App.icons.icon('capsule', 14)} Choisir mon avatar parmi mes Pokémon</button>${profile.avatar || profile.avatarPoke ? '<button class="btn sm ghost" id="e-avatar-del">Retirer</button>' : ''}</div>
            <div class="small muted" style="margin-top:4px">${App.cloud.user ? 'Tu attrapes des Pokémon en ouvrant tes <a href="#/capsules">capsules</a>.' : 'Connecte-toi pour ouvrir des capsules et attraper des Pokémon.'}</div>
            <h3 style="margin-top:16px">Afficher</h3>
            <label class="check"><input type="checkbox" id="e-stats" ${profile.showStats ? 'checked' : ''}> Statistiques</label><br>
            <label class="check"><input type="checkbox" id="e-badges" ${profile.showBadges ? 'checked' : ''}> Badges</label><br>
            <label class="check"><input type="checkbox" id="e-top" ${profile.showTop ? 'checked' : ''}> « Les plus précieuses »</label><br>
            <label class="check"><input type="checkbox" id="e-certs" ${profile.showCerts !== false ? 'checked' : ''}> Cartes certifiées</label><br>
            <label class="check"><input type="checkbox" id="e-wish" ${profile.showWish !== false ? 'checked' : ''}> « Je recherche » (ta liste de souhaits)</label>
          </div>
          <div>
            <h3>Thème</h3>
            ${fp(V.THEMES, profile.theme, 'theme', (k) => `<div class="sw vitrine theme-${k}" style="padding:0"></div>`)}
            <h3 style="margin-top:16px">Cadre des cartes</h3>
            ${fp(V.FRAMES, profile.frame, 'frame', (k) => `<div class="sw frame-${k}" style="padding:6px"><div style="background:#556;height:100%;border-radius:4px"></div></div>`)}
            <h3 style="margin-top:16px">Mise en page</h3>
            <div class="chips">${V.LAYOUTS.map(([k, l]) => `<button class="chip ${profile.layout === k ? 'on' : ''}" data-layout="${k}">${l}</button>`).join('')}</div>
          </div>
        </div>
      `;
    };

    const save = async (redraw = true) => {
      await App.col.saveProfile(profile);
      if (redraw) { const y = window.scrollY; await draw(); window.scrollTo(0, y); }
    };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#v-edit')) {
        editing = !editing; await draw();
        if (editing) { const ed = el.querySelector('#v-editor'); if (ed) ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      if (t.closest('#v-pickcards2')) {
        e.preventDefault(); editing = true; await draw();
        const h = el.querySelector('#e-picker'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (t.closest('#v-share, #e-share')) {
        const name = S.pub ? profile.pseudo : await App.cloud.myPseudo().catch(() => null);
        if (!name) return App.util.toast('Réserve d’abord ton pseudo');
        const link = App.friends.publicLink(name);
        const mine = !S.pub || (App.cloud.user && App.cloud.user.id === S.uid);
        if (navigator.share) { navigator.share({ title: `Vitrine de ${name} · CollecDex`, text: mine ? 'Viens voir ma collection de cartes sur CollecDex !' : `La collection de ${name} sur CollecDex`, url: link }).catch(() => {}); return; }
        try { await navigator.clipboard.writeText(link); App.util.toast('Lien copié ✓'); }
        catch (err) { const f = el.querySelector('#e-publink'); if (f) f.select(); else App.util.toast(link); }
        return;
      }
      if (t.closest('#e-pick-clear')) { profile.featured = []; return save(); }
      if (t.closest('#e-pseudo-ok')) {
        const v = el.querySelector('#e-pseudo').value.trim(), msg = el.querySelector('#e-pseudo-msg');
        if (!App.cloud.user) { profile.pseudo = v || 'Dresseur'; await save(); return; }
        msg.textContent = 'Vérification…';
        try {
          const r = await App.cloud.rpc('claim_pseudo', { p: v });
          if (r && r.ok) { profile.pseudo = r.pseudo; await save(); App.col.notify(); App.util.toast('Pseudo enregistré ✓'); }
          else { msg.innerHTML = `<span style="color:#ff8a8a">${esc((r && r.reason) || 'Pseudo refusé')}</span>`; }
        } catch (err) {
          msg.innerHTML = `<span style="color:#ff8a8a">${/claim_pseudo|function/i.test(err.message) ? 'Réservation des pseudos pas encore activée sur le serveur' : esc(err.message)}</span>`;
        }
        return;
      }
      const th = t.closest('[data-theme]'); if (th) { profile.theme = th.dataset.theme; return save(); }
      const fr = t.closest('[data-frame]'); if (fr) { profile.frame = fr.dataset.frame; return save(); }
      const ly = t.closest('[data-layout]'); if (ly) { profile.layout = ly.dataset.layout; return save(); }
      const pk = t.closest('[data-pick]');
      if (pk) {
        const k = pk.dataset.pick;
        if (profile.featured.includes(k)) profile.featured = profile.featured.filter((x) => x !== k);
        else if (profile.featured.length >= 9) return App.util.toast('9 cartes maximum à l’honneur');
        else profile.featured.push(k);
        return save();
      }
      if (t.closest('#e-avatar-del')) { if (profile.avatar) App.cloud.markPhotoDelete(profile.avatar); profile.avatar = null; profile.avatarPoke = null; return save(); }
      if (t.closest('#e-avatar-pick')) {
        const pick = await App.views.capsules.pickAvatar();
        if (!pick) return;
        if (profile.avatar) App.cloud.markPhotoDelete(profile.avatar);
        profile.avatar = null; profile.avatarPoke = pick;
        return save();
      }
      const vc = t.closest('#v-page .vcard');
      if (vc && !editing) App.cardModal(vc.dataset.game, vc.dataset.card);
    });
    el.addEventListener('change', async (e) => {
      const t = e.target;
      if (t.id === 'e-avatar' && t.files[0]) {
        const blob = await App.util.resizeImage(t.files[0], 400);
        const id = 'avatar_' + Date.now();
        await App.db.set('photos', id, blob);
        App.cloud.markPhoto(id);
        if (profile.avatar) { await App.db.del('photos', profile.avatar).catch(() => {}); App.cloud.markPhotoDelete(profile.avatar); }
        profile.avatar = id; return save();
      }
      if (t.id === 'e-stats') { profile.showStats = t.checked; return save(); }
      if (t.id === 'e-badges') { profile.showBadges = t.checked; return save(); }
      if (t.id === 'e-top') { profile.showTop = t.checked; return save(); }
      if (t.id === 'e-wish') { profile.showWish = t.checked; return save(); }
      if (t.id === 'e-certs') { profile.showCerts = t.checked; return save(); }
      if (t.id === 'e-public') {
        profile.public = t.checked; await save();
        App.util.toast(t.checked ? 'Ta vitrine est publique : partage le lien !' : 'Ta vitrine n’est plus publique');
        return;
      }
      if (t.id === 'e-pubphotos') { profile.publicPhotos = t.checked; return save(); }
      if (t.dataset.cframe) { if (t.value) profile.frames[t.dataset.cframe] = t.value; else delete profile.frames[t.dataset.cframe]; return save(); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'e-pick-q') return;
      const q = App.util.norm(e.target.value);
      el.querySelectorAll('.pick-list .pk').forEach((d) => { d.hidden = !!q && !d.dataset.q.includes(q); });
    });
    el.addEventListener('keydown', (e) => { if (e.target.id === 'e-pseudo' && e.key === 'Enter') el.querySelector('#e-pseudo-ok').click(); });
    el.addEventListener('input', App.util.debounce(async (e) => {
      if (e.target.id === 'e-bio') { profile.bio = e.target.value; await save(false); }
    }, 400));

    await loadBadges();
    await draw();
    if (S.friend) return;
    // La collection change souvent en arrière-plan (prix du jour, synchro…) : on ne redessine la vitrine
    // que si ce qu'elle montre a vraiment changé, une seule fois, et sans faire sauter le défilement.
    const sig = () => owned().map((i) => `${i.key}:${i.qty}:${i.favorite ? 1 : 0}:${i.displayPhoto || ''}:${App.col.valueOf(i)}`).join('|');
    let lastSig = sig(), t = null;
    const unsub = App.col.on(() => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (editing || !alive()) return;
        const s = sig(); if (s === lastSig) return;
        lastSig = s;
        const y = window.scrollY;
        el.style.minHeight = el.offsetHeight + 'px'; // garde la hauteur le temps que les images se rechargent
        await draw();
        window.scrollTo(0, y);
        setTimeout(() => { el.style.minHeight = ''; }, 1500);
      }, 1200);
    });
    return () => { clearTimeout(t); unsub(); };
  },
};
