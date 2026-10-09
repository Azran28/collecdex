/*
 * Petit moteur de tests de CollecDex (tests.html), sans bibliothèque.
 * Le vrai site est ouvert dans un cadre (même origine) : les tests utilisent son App (W.App).
 * Résultat lisible par un robot (GitHub Actions, outils/ci/run-tests.mjs) : window.__tests.
 *   test(nom, fn)        fn(App, W) ; échec = exception (eq / ok / near ci-dessous)
 *   test(nom, fn, { net: true })  a besoin d'internet (TCGdex…) : réessayé une fois
 */
(() => {
  const T = window.__tests = { done: false, pass: 0, fail: 0, results: [], started: Date.now() };
  const list = [];
  window.test = (name, fn, opt = {}) => list.push({ name, fn, ...opt });

  const show = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  window.ok = (c, msg) => { if (!c) throw new Error(msg || 'condition fausse'); };
  window.eq = (got, want, msg) => {
    if (show(got) !== show(want)) throw new Error(`${msg ? msg + ' : ' : ''}obtenu ${show(got)}, attendu ${show(want)}`);
  };
  window.near = (got, want, tol, msg) => { if (!(Math.abs(got - want) <= tol)) throw new Error(`${msg ? msg + ' : ' : ''}obtenu ${got}, attendu ${want} ± ${tol}`); };
  window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** attend que cond() soit vraie (ou lève une erreur après ms) */
  window.until = async (cond, ms = 10000, what = 'attente') => {
    const t0 = Date.now();
    for (;;) { try { if (await cond()) return; } catch (e) { /* pas encore */ } if (Date.now() - t0 > ms) throw new Error(`${what} : trop long (${ms / 1000} s)`); await sleep(100); }
  };

  const ul = document.getElementById('list'), sum = document.getElementById('sum');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function report(r) {
    T.results.push(r); r.ok ? T.pass++ : T.fail++;
    const li = document.createElement('li'); li.className = r.ok ? 'ok' : 'ko';
    li.innerHTML = `<span class="t">${r.ms} ms</span>${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<span class="why">${esc(r.err)}</span>`}`;
    ul.appendChild(li);
    sum.textContent = `${T.pass} réussis, ${T.fail} en échec…`;
  }

  window.__runTests = async (ctx) => {
    for (const t of list) {
      const t0 = performance.now();
      let err = null;
      for (let k = 0; k < (t.net ? 2 : 1); k++) {
        try { await t.fn(ctx.App(), ctx.W()); err = null; break; } catch (e) { err = e; if (t.net) await sleep(1500); }
      }
      report({ name: t.name, ok: !err, err: err ? (err.stack || String(err)).split('\n').slice(0, 3).join('\n') : '', ms: Math.round(performance.now() - t0) });
    }
    T.done = true; T.ms = Date.now() - T.started;
    sum.textContent = T.fail ? `✗ ${T.fail} test(s) en échec, ${T.pass} réussis (${Math.round(T.ms / 1000)} s)` : `✓ Les ${T.pass} tests sont réussis (${Math.round(T.ms / 1000)} s)`;
    sum.className = T.fail ? 'ko' : 'ok';
  };
})();
