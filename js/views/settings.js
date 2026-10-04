/* Paramètres : langue, façon de compter la complétion, sauvegarde et restauration */
App.views.settings = {
  async render(el) {
    const S = App.settings;
    el.innerHTML = `
      <div class="breadcrumb"><a href="#/">Accueil</a> › Paramètres</div>
      <h1>Paramètres</h1>
      <div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        <section class="panel" id="p-account"></section>
        <section class="panel">
          <h2>Affichage</h2>
          <p><label>Langue des cartes<br>
            <select id="p-lang"><option value="fr">Français</option><option value="en">Anglais</option><option value="de">Allemand</option><option value="it">Italien</option><option value="es">Espagnol</option></select></label></p>
          <p><label>Compter la complétion d’une série sur<br>
            <select id="p-comp"><option value="total">Toutes les cartes (secrètes incluses)</option><option value="official">Les cartes numérotées seulement (ex. /165)</option></select></label></p>
          <p><label>Cartes que je n’ai pas encore<br>
            <select id="p-missing"><option value="grise">Visuel officiel grisé</option><option value="numero">Numéro et nom seulement (plus léger)</option></select></label></p>
          <p><label class="check"><input type="checkbox" id="p-photos"> Afficher mes photos (scans) à la place des visuels officiels</label></p>
          <p><label class="check"><input type="checkbox" id="p-sound"> Sons à l’ouverture des capsules</label></p>
          <p><label class="check"><input type="checkbox" id="p-visual"> Vérification par l’image des pages de classeur</label><br><span class="muted small">Bien plus juste, un peu plus lente ; la 1ʳᵉ fois, ~25 Mo d’outils sont téléchargés (plutôt en Wi‑Fi).</span></p>
          <p><label class="check"><input type="checkbox" id="p-timing"> Afficher le temps de chaque étape sous la liste (pour les tests)</label></p>
        </section>
        <section class="panel">
          <h2>Application</h2>
          <div id="p-install"></div>
          <p style="margin-top:12px"><button class="btn" id="p-onboard">${App.icons.icon('sparkles', 16)} Revoir la présentation de l’appli</button></p>
        </section>
        <section class="panel">
          <h2>Notifications</h2>
          <div id="p-notify"></div>
        </section>
        <section class="panel">
          <h2>Sauvegarde</h2>
          <p class="muted small">Ta collection est enregistrée dans ce navigateur, sur ce PC. Fais une sauvegarde de temps en temps (elle contient aussi tes photos et ta vitrine).</p>
          <div class="row"><button class="btn primary" id="p-export">⬇ Télécharger une sauvegarde</button>
            <label class="btn">⬆ Restaurer une sauvegarde<input type="file" accept=".json,application/json" id="p-import" hidden></label></div>
          <h3 style="margin-top:18px">Tableur</h3>
          <p class="muted small">La liste de tes cartes (série, numéro, rareté, état, prix, valeur…) à ouvrir dans Excel ou Google Sheets. Ce n’est pas une sauvegarde : elle ne se restaure pas.</p>
          <div class="row"><button class="btn" id="p-csv">⬇ Exporter en tableur (CSV)</button></div>
          <h3 style="margin-top:18px">Importer ma collection</h3>
          <p class="muted small">Depuis Cardmarket, Collectr, un fichier Excel ou CSV (aussi celui exporté ci-dessus). Les cartes importées ne sont pas certifiées.</p>
          <div class="row"><a class="btn" href="#/importer">⬆ Importer un fichier</a></div>
        </section>
        <section class="panel">
          <h2>Données</h2>
          <p class="small">Cartes, raretés, images et prix : <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a> (base libre et gratuite). Prix Cardmarket en € mis à jour chaque jour, TCGplayer en $.</p>
          <p class="small">Taux de drop : études publiques d’ouverture de boosters, source indiquée à chaque fois (pas de chiffres officiels chez Pokémon).</p>
          <p class="small">Valeur estimée : prix Cardmarket ajusté selon l’état que tu indiques (ou la valeur que tu saisis toi-même).</p>
          <div class="row"><button class="btn sm" id="p-cache">Vider le cache des données</button><button class="btn sm ghost" id="p-reset">Effacer toute ma collection</button></div>
          <h3 style="margin-top:18px">À propos</h3>
          <p class="small muted">CollecDex est une application de fans, <b>non officielle</b>, sans lien avec Nintendo, The Pokémon Company, Creatures, Game Freak ni aucun autre éditeur de cartes. Pokémon et les noms associés sont des marques de leurs propriétaires respectifs.</p>
          <p class="small"><a href="confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a>${App.cloud.enabled ? ' · <a href="#/supprimer-compte">Supprimer mon compte</a>' : ''}</p>
        </section>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const offInstall = App.install.panel($('#p-install'));
    $('#p-onboard').addEventListener('click', () => App.onboarding.show());
    const offNotify = App.notify.panel($('#p-notify'));
    const accOff = App.views.account.render($('#p-account'), { query: {}, embedded: true });
    $('#p-lang').value = S.lang; $('#p-comp').value = S.completion; $('#p-photos').checked = S.preferPhotos; $('#p-missing').value = S.missingStyle || 'grise'; $('#p-sound').checked = S.sound !== false; $('#p-visual').checked = S.visualCheck !== false; $('#p-timing').checked = !!S.showTiming;
    const save = async (msg = 'Enregistré ✓') => { await App.col.saveSettings(); App.util.toast(msg); };
    $('#p-lang').onchange = (e) => { S.lang = e.target.value; save('Langue changée ✓ (les séries vont se recharger)'); };
    $('#p-comp').onchange = (e) => { S.completion = e.target.value; save(); };
    $('#p-missing').onchange = (e) => { S.missingStyle = e.target.value; save(); };
    $('#p-photos').onchange = (e) => { S.preferPhotos = e.target.checked; save(); };
    $('#p-sound').onchange = (e) => { S.sound = e.target.checked; save(); if (S.sound) App.sfx.click(); };
    $('#p-visual').onchange = (e) => { S.visualCheck = e.target.checked; save(); };
    $('#p-timing').onchange = (e) => { S.showTiming = e.target.checked; save(); };

    $('#p-export').onclick = async () => {
      const data = await App.col.exportAll();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = `collecdex-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    };
    $('#p-csv').onclick = () => {
      const items = App.col.all().filter((i) => i.qty > 0).sort((a, b) => (a.snap.setName || '').localeCompare(b.snap.setName || '') || String(a.snap.localId).localeCompare(String(b.snap.localId), 'fr', { numeric: true }));
      if (!items.length) return App.util.toast('Ton Dex est vide pour l’instant.');
      const num = (v) => (v ? String(Math.round(v * 100) / 100).replace('.', ',') : '');
      const rows = [['Jeu', 'Série', 'Numéro', 'Nom', 'Rareté', 'Quantité', 'Versions', 'Favorite', 'État', 'Prix marché', 'Devise', 'Valeur estimée (€)', 'Commentaire']];
      for (const it of items) rows.push([App.games.info(it.game).name, it.snap.setName, it.snap.localId, it.snap.name, App.pokemonRarity.label(it.snap.rarity), it.qty, (it.variants || []).join(' '), it.favorite ? 'oui' : '', App.col.condLabel(it.cond), it.price && it.price.value != null ? String(it.price.value).replace('.', ',') : '', it.price ? it.price.unit || '' : '', num(App.col.valueOf(it)), it.note || '']);
      const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `ma-collection-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    };
    $('#p-import').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const how = await App.util.ask({
          icon: 'download', title: 'Restaurer cette sauvegarde ?',
          text: `${(data.items || []).length} cartes. Tu peux les ajouter à ta collection actuelle, ou remplacer entièrement ta collection actuelle.`,
          choices: [{ label: 'Ajouter à ma collection', value: 'merge', kind: 'primary' }, { label: 'Tout remplacer', value: 'replace', kind: 'danger' }],
        });
        if (!how) return;
        await App.col.importAll(data, { merge: how === 'merge' });
        App.util.toast(`Sauvegarde restaurée ✓ (${(data.items || []).length} cartes)`);
      } catch (err) { App.util.toast('Restauration impossible : ' + err.message, 5000); }
      finally { e.target.value = ''; }
    };
    $('#p-cache').onclick = async () => { await App.db.clear('cache'); App.util.toast('Cache vidé ✓'); };
    $('#p-reset').onclick = async () => {
      const online = App.cloud.enabled && App.cloud.user;
      if (!await App.util.ask({ icon: 'trash', danger: true, title: 'Effacer toute ta collection ?', text: `Tes cartes, tes photos et ta vitrine seront effacées${online ? ', sur cet appareil ET dans ton compte en ligne' : ''}. Fais une sauvegarde avant.`, ok: 'Tout effacer' })) return;
      if (!await App.util.ask({ icon: 'trash', danger: true, title: 'Vraiment sûr ?', text: 'C’est définitif : impossible de revenir en arrière.', ok: 'Oui, tout effacer', cancel: 'Non, garder ma collection' })) return;
      if (online) {
        // connecté : on efface aussi dans le compte (sinon tout reviendrait à la prochaine synchronisation)
        for (const it of App.col.all()) await App.col.remove(it.key);
        await App.col.saveProfile({}); // vitrine remise à zéro (envoyée comme la plus récente)
        await App.cloud.flushNow().catch(() => {});
      }
      await App.db.clear('items'); await App.db.clear('photos'); await App.db.del('kv', 'profile');
      location.reload();
    };
    return () => { offInstall(); offNotify(); accOff.then((f) => { if (typeof f === 'function') f(); }); };
  },
};
