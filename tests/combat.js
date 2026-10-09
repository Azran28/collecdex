/*
 * Combats complets contre l'ordinateur, joués par le test (cartes de prêt : marche avec une collection vide).
 * Rien n'est enregistré : on appelle l'écran de combat directement (c'est la page Combat qui compte victoires et défaites).
 */
(() => {
  async function play(App, W, opts) {
    const MP = App.matchParts, d = W.document;
    ok(MP && MP.battle, 'écran de combat introuvable (App.matchParts.battle)');
    MP.battle(1, [], 'Test', opts);
    // 1er combat d'une licence sur un appareil neuf : ses données sont téléchargées (One Piece : index des cartes) → jusqu'à 90 s
    let refused = null;
    await until(() => {
      const t = d.getElementById('toast');
      if (!d.querySelector('.bt-ov') && t && !t.hidden && /Combat impossible/.test(t.textContent)) { refused = t.textContent; return true; }
      return d.querySelector('.bt-ov [data-atk], .bt-ov [data-charge]');
    }, 90000, 'début du combat').then(() => { if (refused) throw new Error('le combat ne démarre pas : ' + refused); }, (e) => {
      const t = d.getElementById('toast');
      throw new Error(`${e.message}${t && !t.hidden ? ` (message : ${t.textContent})` : ''}${d.querySelector('.bt-ov') ? ' (écran de combat ouvert : ' + d.querySelector('.bt-ov').textContent.replace(/\s+/g, ' ').slice(0, 120) + ')' : ''}`);
    });
    let n = 0;
    try {
      for (; n < 400 && !d.querySelector('.bt-ov .bt-end'); n++) {
        MP.setFast(true); // sans attente ni effets jusqu'au prochain choix du joueur
        const ov = d.querySelector('.bt-ov');
        ok(ov, 'l’écran de combat s’est fermé tout seul');
        const pickBench = ov.classList.contains('pick-bench') && [...ov.querySelectorAll('[data-bench="P"]')].find((b) => !b.classList.contains('ko') && !b.classList.contains('on'));
        const btn = pickBench || ov.querySelector('[data-atk]:not([disabled])') || ov.querySelector('[data-charge]');
        if (btn) btn.click();
        await sleep(btn ? 30 : 120);
      }
      const end = d.querySelector('.bt-ov .bt-end');
      ok(end, `pas de fin de combat après ${n} actions`);
      ok(/Victoire|Défaite/.test(end.textContent), 'message de fin');
      return n;
    } finally {
      MP.setFast(false);
      const ov = d.querySelector('.bt-ov'); if (ov) ov.remove();
      d.body.classList.remove('cap-lock');
    }
  }

  test('combat complet contre l’ordinateur (Pokémon, basique)', (App, W) => play(App, W, { game: 'pokemon' }), { net: true });
  test('combat complet contre l’ordinateur (Pokémon, avancé avec pioche)', (App, W) => play(App, W, { game: 'pokemon', adv: true }), { net: true });
  test('combat complet contre l’ordinateur (One Piece)', (App, W) => play(App, W, { game: 'onepiece' }), { net: true });
})();
