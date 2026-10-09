/*
 * Mise à jour de la base de référence des images (data/vis-index.*, data/op-index.*) : ajoute les cartes sorties depuis.
 * Lancé chaque semaine par le robot GitHub (.github/workflows/index.yml → outils/ci/index-maj.mjs), ou à la main :
 *   ouvrir outils/index-maj.html sur un serveur local, puis await __maj('pokemon') / await __maj('onepiece').
 *
 * Les axes de réduction (Pf, Pa) ne sont pas recalculés : les nouvelles cartes sont projetées sur ceux de l'index,
 * exactement comme lors de sa fabrication (js/labo-index.js › pack, js/labo-index-op.js › pack), puis ajoutées à la fin.
 * Format : voir js/visual-worker.js › loadIndex.
 */
(() => {
  const D = 1280;
  const INDEX = { pokemon: 'data/vis-index', onepiece: 'data/op-index' };
  const proj = (x, P, d) => { const y = new Float32Array(d); for (let i = 0; i < D; i++) { const xi = x[i]; if (!xi) continue; const o = i * d; for (let j = 0; j < d; j++) y[j] += xi * P[o + j]; } let n = 0; for (const t of y) n += t * t; n = Math.sqrt(n) || 1; for (let j = 0; j < d; j++) y[j] /= n; return y; };
  const quant = (y) => { let m = 0; for (const t of y) m = Math.max(m, Math.abs(t)); m = m || 1; return { q: Int8Array.from(y, (t) => Math.round((t / m) * 127)), s: m / 127 }; };
  const log = (t) => { console.log('[index]', t); const o = document.getElementById('out'); if (o) o.textContent += '\n' + t; };

  /** Toutes les cartes de la licence : [{ id, set, url }] (mêmes règles que les outils qui ont fabriqué l'index) */
  async function allCards(game) {
    const A = App.games.get(game), out = [], seen = new Set();
    // Pokémon : « Kits du dresseur » tk-… exclus (pas de visuels chez TCGdex, pas rangés en classeur)
    const sets = (await A.listSets()).filter((s) => !(game === 'pokemon' && /^tk-/.test(s.id)));
    for (const s of sets) {
      try {
        const set = await A.getSet(s.id);
        for (const c of set.cards) {
          if (seen.has(c.id)) continue; seen.add(c.id);
          const url = game === 'pokemon' ? A.img.card({ ...c, setId: c.setId || s.id, serieId: c.serieId || (set.group && set.group.id) }, 'low') : A.img.card(c, 'low');
          if (url && (game !== 'pokemon' || /^https:\/\/assets\.tcgdex\.net\//.test(url))) out.push({ id: c.id, set: s.id, url });
        }
      } catch (e) { log(`série ${s.id} : ${e.message}`); }
    }
    return out;
  }

  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

  /** → { game, before, after, added: [ids], failed: [ids], json, bin (base64) } ; json/bin null si rien de nouveau */
  window.__maj = async (game = 'pokemon', { max = 4000 } = {}) => {
    const base = INDEX[game]; if (!base) throw new Error('licence inconnue : ' + game);
    const meta = await (await fetch(base + '.json', { cache: 'no-store' })).json();
    const buf = await (await fetch(base + '.bin', { cache: 'no-store' })).arrayBuffer();
    const { n, d } = meta;
    if (buf.byteLength !== D * d * 8 + n * 8 + n * 2 * d) throw new Error('index illisible (taille du .bin)');
    const Pf = new Float32Array(buf, 0, D * d), Pa = new Float32Array(buf, D * d * 4, D * d);
    const sc0 = new Float32Array(buf, D * d * 8, n * 2), v0 = new Int8Array(buf, D * d * 8 + n * 8, n * 2 * d);
    const have = new Set(meta.ids);
    log(`${game} : ${n} cartes dans l'index, liste des cartes…`);
    const cards = await allCards(game);
    const todo = cards.filter((c) => !have.has(c.id)).slice(0, max);
    log(`${cards.length} cartes connues, ${todo.length} à ajouter`);
    const add = []; const failed = [];
    for (let i = 0; i < todo.length; i += 48) {
      const part = todo.slice(i, i + 48);
      const vecs = await App.visual.embed(part.map((c) => c.url));
      // Pokémon : visuel introuvable en français → la même image en anglais
      const retry = part.map((c, k) => (!vecs[k] && /\/fr\//.test(c.url) ? k : -1)).filter((k) => k >= 0);
      if (retry.length) {
        const v2 = await App.visual.embed(retry.map((k) => part[k].url.replace('/fr/', '/en/')));
        retry.forEach((k, j) => { if (v2[j]) { vecs[k] = v2[j]; part[k].url = part[k].url.replace('/fr/', '/en/'); } });
      }
      part.forEach((c, k) => { if (vecs[k]) add.push({ ...c, ...vecs[k] }); else failed.push(c.id); });
      log(`${Math.min(i + 48, todo.length)} / ${todo.length}`);
    }
    if (!add.length) return { game, before: n, after: n, added: [], failed, json: null, bin: null };
    const m = n + add.length;
    const sc = new Float32Array(m * 2), v = new Int8Array(m * 2 * d);
    sc.set(sc0); v.set(v0);
    add.forEach((x, k) => {
      const r = n + k, f = quant(proj(x.full, Pf, d)), a = quant(proj(x.art, Pa, d));
      sc[2 * r] = f.s; sc[2 * r + 1] = a.s; v.set(f.q, r * 2 * d); v.set(a.q, r * 2 * d + d);
    });
    const img = (x) => (game === 'pokemon' ? x.url.replace(meta.base, '').replace(/\/low\.(webp|png)$/, '') : '');
    const out = { ...meta, n: m, date: new Date().toISOString().slice(0, 10), ids: [...meta.ids, ...add.map((x) => x.id)], sets: [...meta.sets, ...add.map((x) => x.set)], imgs: [...meta.imgs, ...add.map(img)] };
    const bin = new Uint8Array(D * d * 8 + m * 8 + m * 2 * d);
    bin.set(new Uint8Array(buf, 0, D * d * 8), 0);
    bin.set(new Uint8Array(sc.buffer), D * d * 8);
    bin.set(new Uint8Array(v.buffer), D * d * 8 + m * 8);
    log(`${add.length} cartes ajoutées, ${failed.length} sans visuel (réessayées la prochaine fois)`);
    return { game, before: n, after: m, added: add.map((x) => x.id), failed, json: JSON.stringify(out), bin: b64(bin) };
  };
  log('prêt : await __maj("pokemon") ou __maj("onepiece")');
})();
