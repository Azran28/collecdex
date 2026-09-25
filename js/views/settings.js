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
          <p><label class="check"><input type="checkbox" id="p-pocket"> Afficher aussi les séries de Pokémon TCG Pocket (jeu mobile)</label></p>
        </section>
        <section class="panel">
          <h2>Application</h2>
          <div id="p-install"></div>
        </section>
        <section class="panel">
          <h2>Sauvegarde</h2>
          <p class="muted small">Ta collection est enregistrée dans ce navigateur, sur ce PC. Fais une sauvegarde de temps en temps (elle contient aussi tes photos et ta vitrine).</p>
          <div class="row"><button class="btn primary" id="p-export">⬇ Télécharger une sauvegarde</button>
            <label class="btn">⬆ Restaurer une sauvegarde<input type="file" accept=".json,application/json" id="p-import" hidden></label></div>
          <h3 style="margin-top:18px">Tableur</h3>
          <p class="muted small">La liste de tes cartes (série, numéro, rareté, état, prix, valeur…) à ouvrir dans Excel ou Google Sheets. Ce n’est pas une sauvegarde : elle ne se restaure pas.</p>
          <div class="row"><button class="btn" id="p-csv">⬇ Exporter en tableur (CSV)</button></div>
          <p class="small muted" style="margin-top:14px">Import depuis d’autres applis (Cardmarket, Collectr, Pokellector…) : prévu dans une prochaine version.</p>
        </section>
        <section class="panel">
          <h2>Données</h2>
          <p class="small">Cartes, raretés, images et prix : <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a> (base libre et gratuite). Prix Cardmarket en € mis à jour chaque jour, TCGplayer en $.</p>
          <p class="small">Taux de drop : études publiques d’ouverture de boosters, source indiquée à chaque fois (pas de chiffres officiels chez Pokémon).</p>
          <p class="small">Valeur estimée : prix Cardmarket ajusté selon l’état que tu indiques (ou la valeur que tu saisis toi-même).</p>
          <div class="row"><button class="btn sm" id="p-cache">Vider le cache des données</button><button class="btn sm ghost" id="p-reset">Effacer toute ma collection</button></div>
        </section>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const offInstall = App.install.panel($('#p-install'));
    const accOff = App.views.account.render($('#p-account'), { query: {}, embedded: true });
    $('#p-lang').value = S.lang; $('#p-comp').value = S.completion; $('#p-photos').checked = S.preferPhotos; $('#p-missing').value = S.missingStyle || 'grise'; $('#p-pocket').checked = S.showPocket; $('#p-sound').checked = S.sound !== false;
    const save = async (msg = 'Enregistré ✓') => { await App.col.saveSettings(); App.util.toast(msg); };
    $('#p-lang').onchange = (e) => { S.lang = e.target.value; save('Langue changée ✓ (les séries vont se recharger)'); };
    $('#p-comp').onchange = (e) => { S.completion = e.target.value; save(); };
    $('#p-missing').onchange = (e) => { S.missingStyle = e.target.value; save(); };
    $('#p-photos').onchange = (e) => { S.preferPhotos = e.target.checked; save(); };
    $('#p-sound').onchange = (e) => { S.sound = e.target.checked; save(); if (S.sound) App.sfx.click(); };
    $('#p-pocket').onchange = (e) => { S.showPocket = e.target.checked; save(); };

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
        const merge = confirm('Fusionner avec la collection actuelle ?\n\nOK = fusionner\nAnnuler = remplacer entièrement la collection actuelle');
        await App.col.importAll(data, { merge });
        App.util.toast(`Sauvegarde restaurée ✓ (${(data.items || []).length} cartes)`);
      } catch (err) { alert('Restauration impossible : ' + err.message); }
    };
    $('#p-cache').onclick = async () => { await App.db.clear('cache'); App.util.toast('Cache vidé ✓'); };
    $('#p-reset').onclick = async () => {
      if (!confirm('Effacer TOUTE ta collection, tes photos et ta vitrine ? (fais une sauvegarde avant)')) return;
      if (!confirm('Vraiment sûr ? C’est définitif.')) return;
      await App.db.clear('items'); await App.db.clear('photos'); await App.db.del('kv', 'profile');
      location.reload();
    };
    return () => { offInstall(); accOff.then((f) => { if (typeof f === 'function') f(); }); };
  },
};
