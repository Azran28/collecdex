/* Page Compte : connexion, création de compte, mot de passe oublié, état de la synchronisation */
App.views.account = {
  async render(el, params) {
    const { esc } = App.util;
    const C = App.cloud;
    // intégrée dans les Paramètres : titres plus petits, pas de cadre en plus
    const E = !!params.embedded, H = E ? 'h2' : 'h1', P = E ? 'acc-box' : 'panel';
    const labels = { local: 'Mode local (sans compte)', deconnecte: 'Non connecté', synchro: 'Récupération de ta collection…', envoi: 'Envoi en cours…', ok: 'Synchronisé ✓', erreur: 'Problème de synchronisation' };

    if (!C.enabled) {
      el.innerHTML = `<${H}>Compte</${H}><div class="${P}">Ce site fonctionne en mode local : ta collection est enregistrée uniquement sur cet appareil.</div>`;
      return;
    }

    let tab = params.query.nouveau ? 'inscription' : 'connexion', deleting = false;
    const draw = () => {
      const u = C.user;
      if (u && params.query.reset) {
        el.innerHTML = `<${H}>Nouveau mot de passe</${H}>
          <div class="${P}" style="max-width:420px">
            <p><input type="password" id="a-new" placeholder="Nouveau mot de passe (6 caractères min.)" style="width:100%" autocomplete="new-password"></p>
            <button class="btn primary" id="a-setpw">Enregistrer</button> <span id="a-msg" class="small"></span>
          </div>`;
        return;
      }
      if (u && params.del) {
        el.innerHTML = `<div class="breadcrumb"><a href="#/parametres">Paramètres</a> › Supprimer mon compte</div>
          <h1>Supprimer mon compte</h1>
          <div class="panel del-box" style="max-width:560px">
            <p>Compte : <b>${esc(u.email)}</b></p>
            <p>Seront effacés <b>définitivement</b> de nos serveurs :</p>
            <ul class="small">
              <li>ta collection en ligne et toutes tes photos (y compris les preuves de certification) ;</li>
              <li>ta vitrine (y compris sa version publique), ton pseudo, tes objectifs et ta liste de souhaits ;</li>
              <li>tes capsules, tes Pokémon attrapés, tes éclats et tes salons de combat en ligne ;</li>
              <li>tes amis (tu disparais aussi de leur liste) et tes notifications ;</li>
              <li>ton adresse e-mail et ton mot de passe.</li>
            </ul>
            <p class="small muted">Rien n’est gardé ailleurs. Ton pseudo redevient libre. Pense à <a href="#/parametres">télécharger une sauvegarde</a> avant, si tu veux garder ta collection.</p>
            <p><label class="check"><input type="checkbox" id="d-local" checked> Effacer aussi la collection enregistrée sur cet appareil</label></p>
            <p><label>Pour confirmer, écris <b>SUPPRIMER</b> :<br><input type="text" id="d-word" autocomplete="off" autocapitalize="characters" style="width:100%"></label></p>
            <div class="row"><button class="btn danger" id="d-go" disabled>Supprimer définitivement mon compte</button><a class="btn ghost" href="#/parametres">Annuler</a></div>
            <p id="a-msg" class="small" style="margin-bottom:0"></p>
          </div>`;
        return;
      }
      if (u) {
        const n = C.pendingCount();
        el.innerHTML = `<${H}>Mon compte</${H}>
          <div class="${P}" style="max-width:560px">
            <p>Connecté avec <b>${esc(u.email)}</b></p>
            <p>État : <b class="sync-${C.state}">${labels[C.state] || C.state}</b>${C.state === 'erreur' ? `<br><span class="small muted">${esc(C.error)}</span>` : ''}</p>
            ${n ? `<p class="small muted">${n} élément${n > 1 ? 's' : ''} en attente d’envoi (cartes, photos, vitrine).</p>` : ''}
            ${C.lastSync ? `<p class="small muted">Dernière synchronisation : ${new Date(C.lastSync).toLocaleTimeString('fr-FR')}</p>` : ''}
            <p class="small muted">Ta collection, tes photos et ta vitrine sont copiées dans ton compte : connecte-toi avec le même e-mail sur ton téléphone ou un autre ordinateur pour les retrouver.</p>
            <div class="row"><button class="btn" id="a-sync">↻ Synchroniser maintenant</button><button class="btn ghost" id="a-out">Se déconnecter</button></div>
            <div class="row" style="margin-top:12px"><a class="btn sm danger" href="#/supprimer-compte">Supprimer mon compte…</a><a class="btn sm ghost" href="confidentialite.html" target="_blank" rel="noopener">Confidentialité</a></div>
          </div>`;
        return;
      }
      el.innerHTML = `${params.del ? `<${H}>Supprimer mon compte</${H}><p><b>Connecte-toi d’abord</b> au compte que tu veux supprimer.</p>` : `<${H}>Compte</${H}>`}
        ${params.del ? '' : `<p class="muted">Connecte-toi pour retrouver ta collection sur tous tes appareils (PC, téléphone…).${App.col.all().length ? ` Les <b>${App.col.all().length} cartes</b> déjà sur cet appareil seront ajoutées à ton compte.` : ''}</p>`}
        <div class="${P}" style="max-width:440px">
          <div class="chips" style="margin-bottom:14px">
            <button class="chip ${tab === 'connexion' ? 'on' : ''}" data-tab="connexion">Se connecter</button>
            <button class="chip ${tab === 'inscription' ? 'on' : ''}" data-tab="inscription">Créer un compte</button>
          </div>
          <form id="a-form">
            <p><input type="email" id="a-email" placeholder="E-mail" required style="width:100%" autocomplete="email"></p>
            <p><input type="password" id="a-pw" placeholder="Mot de passe${tab === 'inscription' ? ' (6 caractères min.)' : ''}" required style="width:100%" autocomplete="${tab === 'inscription' ? 'new-password' : 'current-password'}"></p>
            <button class="btn primary" type="submit">${tab === 'inscription' ? 'Créer mon compte' : 'Se connecter'}</button>
            ${tab === 'connexion' ? '<button class="btn ghost sm" type="button" id="a-forgot">Mot de passe oublié ?</button>' : ''}
          </form>
          ${tab === 'inscription' ? '<p class="small muted" style="margin:10px 0 0">En créant un compte, tu acceptes la <a href="confidentialite.html" target="_blank" rel="noopener">politique de confidentialité</a>.</p>' : ''}
          <p id="a-msg" class="small" style="margin-bottom:0"></p>
        </div>`;
    };
    draw();

    const msg = (t, ok = false) => { const m = el.querySelector('#a-msg'); if (m) { m.textContent = t; m.style.color = ok ? 'var(--ok)' : '#ff8a8a'; } };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return draw(); }
      if (t.closest('#a-sync')) { C.sync(); return; }
      if (t.closest('#d-go')) {
        if (el.querySelector('#d-word').value.trim().toUpperCase() !== 'SUPPRIMER') return;
        if (!(await App.util.ask({ icon: 'user', danger: true, title: 'Dernière vérification', text: 'Supprimer ton compte et toutes ses données ? Impossible de revenir en arrière.', ok: 'Supprimer mon compte' }))) return;
        const wipe = el.querySelector('#d-local').checked, b = t.closest('#d-go');
        b.disabled = true; deleting = true;
        msg('Suppression en cours… ne ferme pas la page.', true);
        try {
          await C.deleteAccount();
          if (wipe) { await App.col.wipeLocal(); await App.db.clear('kv').catch(() => {}); }
          App.util.toast('Ton compte a été supprimé. Merci d’avoir utilisé CollecDex.');
          setTimeout(() => { location.hash = '#/'; location.reload(); }, 2500);
        } catch (err) { deleting = false; msg(err.message); b.disabled = false; }
        return;
      }
      if (t.closest('#a-out')) { if (await App.util.ask({ icon: 'user', title: 'Te déconnecter ?', text: 'Ta collection reste enregistrée dans ton compte.', ok: 'Me déconnecter' })) { await C.signOut(); draw(); } return; }
      if (t.closest('#a-forgot')) {
        const email = el.querySelector('#a-email').value.trim();
        if (!email) return msg('Indique ton e-mail ci-dessus, puis reclique sur « Mot de passe oublié ».');
        try { await C.resetPassword(email); msg('E-mail envoyé : clique sur le lien reçu pour choisir un nouveau mot de passe.', true); } catch (err) { msg(err.message); }
        return;
      }
      if (t.closest('#a-setpw')) {
        try { await C.newPassword(el.querySelector('#a-new').value); App.util.toast('Mot de passe changé ✓'); location.hash = '#/parametres'; } catch (err) { msg(err.message); }
      }
    });
    el.addEventListener('input', (e) => {
      if (e.target.id === 'd-word') el.querySelector('#d-go').disabled = e.target.value.trim().toUpperCase() !== 'SUPPRIMER';
    });
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = el.querySelector('#a-email').value.trim(), pw = el.querySelector('#a-pw').value;
      const btn = el.querySelector('#a-form button[type=submit]'); btn.disabled = true;
      try {
        if (tab === 'inscription') {
          const r = await C.signUp(email, pw);
          if (r.needsConfirm) { msg('Compte créé ! Ouvre l’e-mail reçu et touche le lien de confirmation : tu seras connecté tout de suite. (Pas d’e-mail ? Regarde dans les indésirables.)', true); btn.disabled = false; return; }
        } else {
          await C.signIn(email, pw);
        }
        App.util.toast('Connecté ✓ — synchronisation de ta collection…');
        if (!E && !params.del) { location.hash = (await App.friends.takeInvite()) ? '#/amis' : '#/compte'; return; }
        draw();
      } catch (err) { msg(err.message); btn.disabled = false; }
    });

    // page de suppression déjà affichée : on ne la redessine pas (le mot tapé serait effacé)
    const unsub = C.on(() => { if (C.user && !params.query.reset && !deleting && !(params.del && el.querySelector('#d-word'))) draw(); });
    return unsub;
  },
};
