/* Page « Mes amis » : ajouter par pseudo ou par lien d'invitation, demandes reçues / envoyées, voir la vitrine d'un ami */
App.views.friends = {
  async render(el, params, alive) {
    const { esc } = App.util;
    const F = App.friends;
    const inviteFromLink = params.query.ajout ? String(params.query.ajout).slice(0, 20) : null;
    if (inviteFromLink) await F.saveInvite(inviteFromLink);

    const av = (a, name, size = 44) => {
      const url = a && a.id ? App.pokedex.img(a.id, !!a.shiny) : '';
      return `<span class="fr-av" style="width:${size}px;height:${size}px;${url ? `background-image:url('${url}')` : ''}">${url ? '' : esc((name || '?')[0].toUpperCase())}</span>`;
    };

    // pas connecté : on garde l'invitation pour après
    if (!App.cloud.enabled || !App.cloud.user) {
      const inv = inviteFromLink || await F.takeInvite();
      el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › Mes amis</div><h1>Mes amis</h1>
        ${inv ? `<section class="panel fr-invite"><div class="fr-inv-ico">${App.icons.icon('users', 26)}</div><div><b>${esc(inv)} t’invite sur CollecDex !</b>
          <p class="small muted" style="margin:4px 0 10px">Crée ton compte (ou connecte-toi) : l’invitation t’attendra ici pour devenir amis et voir sa vitrine.</p>
          <div class="row" style="gap:8px"><a class="btn primary" href="#/connexion?nouveau=1">${App.icons.icon('user', 16)} Créer mon compte</a><a class="btn ghost" href="#/connexion">J’ai déjà un compte</a></div></div></section>`
          : `<div class="panel"><p>Connecte-toi pour ajouter des amis, voir leur vitrine et leur montrer la tienne.</p><a class="btn primary" href="#/connexion">${App.icons.icon('user', 16)} Me connecter</a></div>`}`;
      return;
    }

    let pseudo = null;
    const draw = async () => {
      let rows = [];
      let err = null;
      try { rows = await F.list({ fresh: true }); } catch (e) { err = e; }
      pseudo = await App.cloud.myPseudo().catch(() => null);
      const inv = inviteFromLink || await F.takeInvite();
      if (!alive()) return;
      const friends = rows.filter((r) => r.status === 'accepted');
      const incoming = rows.filter((r) => r.incoming);
      const sent = rows.filter((r) => r.status === 'pending' && !r.incoming);
      const invRow = inv && rows.find((r) => r.pseudo.toLowerCase() === inv.toLowerCase());
      const link = pseudo ? F.inviteLink(pseudo) : '';

      el.innerHTML = `<div class="breadcrumb"><a href="#/">Accueil</a> › <a href="#/compte">Ma vitrine</a> › Mes amis</div>
        <h1>Mes amis</h1>
        ${F.missing ? '<div class="panel" style="border-color:var(--accent2)"><b>Il reste une étape :</b> lancer le script <code>supabase-v4.sql</code> dans Supabase (SQL Editor) pour activer les amis.</div>' : ''}
        ${err && !F.missing ? `<div class="panel small" style="color:#ff8a8a">${esc(err.message)}</div>` : ''}
        ${inv && !invRow && (!pseudo || pseudo.toLowerCase() !== inv.toLowerCase()) ? `<section class="panel fr-invite"><div class="fr-inv-ico">${App.icons.icon('users', 26)}</div><div>
            <b>${esc(inv)} t’invite à devenir amis</b><p class="small muted" style="margin:4px 0 10px">Vous pourrez voir la vitrine l’un de l’autre.</p>
            <div class="row" style="gap:8px"><button class="btn primary" data-add="${esc(inv)}">${App.icons.icon('plus', 16)} Ajouter ${esc(inv)}</button><button class="btn ghost" id="fr-inv-no">Ignorer</button></div></div></section>` : ''}
        ${!pseudo ? `<section class="panel"><h2>Choisis ton pseudo</h2>
            <p class="small muted">C’est avec lui que tes amis te trouvent (unique, 3 à 20 caractères).</p>
            <div class="row" style="gap:8px;flex-wrap:nowrap"><input type="text" id="fr-pseudo" maxlength="20" placeholder="Ton pseudo" style="flex:1;min-width:0"><button class="btn primary" id="fr-pseudo-ok">Valider</button></div>
            <div class="small" id="fr-pseudo-msg" style="margin-top:6px"></div></section>` : ''}
        <div class="fr-cols">
          <section class="panel">
            <h2>Ajouter un ami</h2>
            <div class="row" style="gap:8px;flex-wrap:nowrap"><input type="text" id="fr-q" maxlength="20" placeholder="Son pseudo" style="flex:1;min-width:0" ${pseudo ? '' : 'disabled'}><button class="btn primary" id="fr-add" ${pseudo ? '' : 'disabled'}>Ajouter</button></div>
            <div class="small" id="fr-msg" style="margin-top:6px"></div>
            ${pseudo ? `<h3 style="margin-top:16px">Ou invite-le avec ton lien</h3>
              <p class="small muted" style="margin-top:0">Il ouvre le site, crée son compte, et la demande d’ami est prête.</p>
              <div class="fr-link"><input type="text" readonly value="${esc(link)}" id="fr-link"><button class="btn" id="fr-copy">${navigator.share ? 'Partager' : 'Copier'}</button></div>` : ''}
          </section>
          ${incoming.length ? `<section class="panel fr-incoming"><h2>Demandes reçues <span class="fr-count">${incoming.length}</span></h2>
            ${incoming.map((r) => `<div class="fr-row">${av(r.avatar, r.pseudo)}<div class="fr-who"><b>${esc(r.pseudo)}</b><span class="small muted">${r.cards} carte${r.cards > 1 ? 's' : ''}</span></div>
              <button class="btn sm primary" data-accept="${r.user_id}">Accepter</button><button class="btn sm ghost" data-refuse="${r.user_id}">Refuser</button></div>`).join('')}</section>` : ''}
        </div>
        <section class="section">
          <div class="section-title"><h2>Mes amis</h2><span class="muted small">${friends.length}</span></div>
          ${friends.length ? `<div class="fr-grid">${friends.map((r) => `<div class="fr-card">
              <a class="fr-open" href="#/ami/${r.user_id}">${av(r.avatar, r.pseudo, 64)}<b>${esc(r.pseudo)}</b><span class="small muted">${r.cards} carte${r.cards > 1 ? 's' : ''}</span></a>
              <a class="btn sm primary" href="#/ami/${r.user_id}">${App.icons.icon('trophy', 14)} Sa vitrine</a>
              <button class="linkbtn small muted" data-remove="${r.user_id}" data-name="${esc(r.pseudo)}">Retirer</button></div>`).join('')}</div>`
            : '<div class="empty panel">Pas encore d’amis : ajoute-les avec leur pseudo, ou envoie-leur ton lien.</div>'}
        </section>
        ${sent.length ? `<section class="section"><div class="section-title"><h2>Demandes envoyées</h2></div>
          ${sent.map((r) => `<div class="fr-row panel">${av(r.avatar, r.pseudo, 36)}<div class="fr-who"><b>${esc(r.pseudo)}</b><span class="small muted">En attente de réponse</span></div><button class="btn sm ghost" data-remove="${r.user_id}" data-name="">Annuler</button></div>`).join('')}</section>` : ''}`;
    };

    const add = async (who, msgEl) => {
      if (!who) return;
      if (msgEl) { msgEl.style.color = ''; msgEl.textContent = 'Envoi…'; }
      try {
        const r = await F.request(who);
        if (!r.ok) { if (msgEl) { msgEl.style.color = '#ff8a8a'; msgEl.textContent = r.reason; } else App.util.toast(r.reason); return; }
        App.util.toast(r.state === 'amis' ? `🎉 ${r.pseudo} et toi êtes amis !` : `Demande envoyée à ${r.pseudo} ✓`);
        await F.clearInvite();
        if (params.query.ajout) { location.hash = '#/amis'; return; }
        await draw();
      } catch (e) { if (msgEl) { msgEl.style.color = '#ff8a8a'; msgEl.textContent = e.message; } else App.util.toast(e.message); }
    };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#fr-add')) return add(el.querySelector('#fr-q').value.trim(), el.querySelector('#fr-msg'));
      const ad = t.closest('[data-add]'); if (ad) return add(ad.dataset.add, null);
      if (t.closest('#fr-inv-no')) { await F.clearInvite(); if (params.query.ajout) { location.hash = '#/amis'; return; } return draw(); }
      const ac = t.closest('[data-accept]'); if (ac) { await F.respond(ac.dataset.accept, true); App.util.toast('Nouvel ami ✓'); return draw(); }
      const rf = t.closest('[data-refuse]'); if (rf) { await F.respond(rf.dataset.refuse, false); return draw(); }
      const rm = t.closest('[data-remove]');
      if (rm) {
        if (rm.dataset.name && !confirm(`Retirer ${rm.dataset.name} de tes amis ?`)) return;
        await F.remove(rm.dataset.remove); return draw();
      }
      if (t.closest('#fr-copy')) {
        const link = el.querySelector('#fr-link').value;
        if (navigator.share) { navigator.share({ title: 'CollecDex', text: `Rejoins-moi sur CollecDex, ma collection de cartes Pokémon !`, url: link }).catch(() => {}); return; }
        try { await navigator.clipboard.writeText(link); App.util.toast('Lien copié ✓'); } catch (err) { el.querySelector('#fr-link').select(); }
      }
      if (t.closest('#fr-pseudo-ok')) {
        const v = el.querySelector('#fr-pseudo').value.trim(), m = el.querySelector('#fr-pseudo-msg');
        m.style.color = ''; m.textContent = 'Vérification…';
        try {
          const r = await App.cloud.rpc('claim_pseudo', { p: v });
          if (r && r.ok) {
            const p = await App.col.getProfile(); p.pseudo = r.pseudo; await App.col.saveProfile(p); App.col.notify();
            App.util.toast('Pseudo enregistré ✓'); return draw();
          }
          m.style.color = '#ff8a8a'; m.textContent = (r && r.reason) || 'Pseudo refusé';
        } catch (err) { m.style.color = '#ff8a8a'; m.textContent = err.message; }
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.id === 'fr-q') el.querySelector('#fr-add').click();
      if (e.target.id === 'fr-pseudo') el.querySelector('#fr-pseudo-ok').click();
    });

    await draw();
  },
};
