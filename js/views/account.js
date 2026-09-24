/* Page Compte : connexion, création de compte, mot de passe oublié, état de la synchronisation */
App.views.account = {
  async render(el, params) {
    const { esc } = App.util;
    const C = App.cloud;
    const labels = { local: 'Mode local (sans compte)', deconnecte: 'Non connecté', synchro: 'Récupération de ta collection…', envoi: 'Envoi en cours…', ok: 'Synchronisé ✓', erreur: 'Problème de synchronisation' };

    if (!C.enabled) {
      el.innerHTML = `<h1>Compte</h1><div class="panel">Ce site fonctionne en mode local : ta collection est enregistrée uniquement sur cet appareil.</div>`;
      return;
    }

    let tab = 'connexion';
    const draw = () => {
      const u = C.user;
      if (u && params.query.reset) {
        el.innerHTML = `<h1>Nouveau mot de passe</h1>
          <div class="panel" style="max-width:420px">
            <p><input type="password" id="a-new" placeholder="Nouveau mot de passe (6 caractères min.)" style="width:100%" autocomplete="new-password"></p>
            <button class="btn primary" id="a-setpw">Enregistrer</button> <span id="a-msg" class="small"></span>
          </div>`;
        return;
      }
      if (u) {
        const n = C.pendingCount();
        el.innerHTML = `<h1>Mon compte</h1>
          <div class="panel" style="max-width:560px">
            <p>Connecté avec <b>${esc(u.email)}</b></p>
            <p>État : <b class="sync-${C.state}">${labels[C.state] || C.state}</b>${C.state === 'erreur' ? `<br><span class="small muted">${esc(C.error)}</span>` : ''}</p>
            ${n ? `<p class="small muted">${n} élément${n > 1 ? 's' : ''} en attente d’envoi (cartes, photos, vitrine).</p>` : ''}
            ${C.lastSync ? `<p class="small muted">Dernière synchronisation : ${new Date(C.lastSync).toLocaleTimeString('fr-FR')}</p>` : ''}
            <p class="small muted">Ta collection, tes photos et ta vitrine sont copiées dans ton compte : connecte-toi avec le même e-mail sur ton téléphone ou un autre ordinateur pour les retrouver.</p>
            <div class="row"><button class="btn" id="a-sync">↻ Synchroniser maintenant</button><button class="btn ghost" id="a-out">Se déconnecter</button></div>
          </div>`;
        return;
      }
      el.innerHTML = `<h1>Compte</h1>
        <p class="muted">Connecte-toi pour retrouver ta collection sur tous tes appareils (PC, téléphone…).${App.col.all().length ? ` Les <b>${App.col.all().length} cartes</b> déjà sur cet appareil seront ajoutées à ton compte.` : ''}</p>
        <div class="panel" style="max-width:440px">
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
          <p id="a-msg" class="small" style="margin-bottom:0"></p>
        </div>`;
    };
    draw();

    const msg = (t, ok = false) => { const m = el.querySelector('#a-msg'); if (m) { m.textContent = t; m.style.color = ok ? 'var(--ok)' : '#ff8a8a'; } };

    el.addEventListener('click', async (e) => {
      const t = e.target;
      const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return draw(); }
      if (t.closest('#a-sync')) { C.sync(); return; }
      if (t.closest('#a-out')) { if (confirm('Te déconnecter ? Ta collection reste enregistrée dans ton compte.')) { await C.signOut(); draw(); } return; }
      if (t.closest('#a-forgot')) {
        const email = el.querySelector('#a-email').value.trim();
        if (!email) return msg('Indique ton e-mail ci-dessus, puis reclique sur « Mot de passe oublié ».');
        try { await C.resetPassword(email); msg('E-mail envoyé : clique sur le lien reçu pour choisir un nouveau mot de passe.', true); } catch (err) { msg(err.message); }
        return;
      }
      if (t.closest('#a-setpw')) {
        try { await C.newPassword(el.querySelector('#a-new').value); App.util.toast('Mot de passe changé ✓'); location.hash = '#/compte'; } catch (err) { msg(err.message); }
      }
    });
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = el.querySelector('#a-email').value.trim(), pw = el.querySelector('#a-pw').value;
      const btn = el.querySelector('#a-form button[type=submit]'); btn.disabled = true;
      try {
        if (tab === 'inscription') {
          const r = await C.signUp(email, pw);
          if (r.needsConfirm) { msg('Compte créé ! Ouvre l’e-mail reçu et clique sur le lien de confirmation, puis connecte-toi ici.', true); btn.disabled = false; return; }
        } else {
          await C.signIn(email, pw);
        }
        App.util.toast('Connecté ✓ — synchronisation de ta collection…');
        draw();
      } catch (err) { msg(err.message); btn.disabled = false; }
    });

    const unsub = C.on(() => { if (C.user && !params.query.reset) draw(); });
    return unsub;
  },
};
